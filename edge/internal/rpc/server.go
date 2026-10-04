package rpc

import (
	"context"
	"crypto/subtle"
	"sync/atomic"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	pb "spiritspin/edge/gen/edgev1"
	"spiritspin/edge/internal/match"
)

type Server struct {
	pb.UnimplementedEdgeServer
	Reg      *match.Registry
	CertHash string
	Draining atomic.Bool
}

func authed(ctx context.Context, token string) error {
	md, _ := metadata.FromIncomingContext(ctx)
	v := md.Get("authorization")
	if len(v) != 1 || subtle.ConstantTimeCompare([]byte(v[0]), []byte("Bearer "+token)) != 1 {
		return status.Error(codes.Unauthenticated, "token")
	}
	return nil
}

func NewGRPC(s *Server, token string) *grpc.Server {
	g := grpc.NewServer(
		grpc.UnaryInterceptor(func(ctx context.Context, req any, _ *grpc.UnaryServerInfo, h grpc.UnaryHandler) (any, error) {
			if err := authed(ctx, token); err != nil {
				return nil, err
			}
			return h(ctx, req)
		}),
		grpc.StreamInterceptor(func(srv any, ss grpc.ServerStream, _ *grpc.StreamServerInfo, h grpc.StreamHandler) error {
			if err := authed(ss.Context(), token); err != nil {
				return err
			}
			return h(srv, ss)
		}),
	)
	pb.RegisterEdgeServer(g, s)
	return g
}

func (s *Server) get(id string) (*match.Match, error) {
	if m := s.Reg.Get(id); m != nil {
		return m, nil
	}
	return nil, status.Error(codes.NotFound, "match")
}

func (s *Server) CreateMatch(_ context.Context, r *pb.CreateMatchRequest) (*pb.CreateMatchResponse, error) {
	if s.Draining.Load() {
		return nil, status.Error(codes.Unavailable, "draining")
	}
	if r.MatchId == "" || len(r.MatchId) > 64 {
		return nil, status.Error(codes.InvalidArgument, "match id")
	}
	s.Reg.Create(r.MatchId)
	return &pb.CreateMatchResponse{CertHash: s.CertHash}, nil
}

func (s *Server) StartRound(_ context.Context, r *pb.StartRoundRequest) (*pb.StartRoundResponse, error) {
	m, err := s.get(r.MatchId)
	if err != nil {
		return nil, err
	}
	return &pb.StartRoundResponse{T0: m.StartRound(r.Round, float64(min(r.LeadInMs, 10000)))}, nil
}

func (s *Server) EndRound(_ context.Context, r *pb.EndRoundRequest) (*pb.EndRoundResponse, error) {
	m, err := s.get(r.MatchId)
	if err != nil {
		return nil, err
	}
	st := m.EndRound(r.Round)
	return &pb.EndRoundResponse{Stats: &pb.RoundStats{
		Frames: st.Frames, Late: st.Late[:], Missing: st.Missing[:],
		Margins:     []int32{int32(st.Margins[0]), int32(st.Margins[1])},
		DatagramsIn: st.In, DatagramsOut: st.Out, Transports: st.Transports[:],
	}}, nil
}

func (s *Server) EndMatch(_ context.Context, r *pb.EndMatchRequest) (*pb.EndMatchResponse, error) {
	s.Reg.Delete(r.MatchId)
	return &pb.EndMatchResponse{}, nil
}

func (s *Server) StreamFrames(r *pb.StreamFramesRequest, st pb.Edge_StreamFramesServer) error {
	m, err := s.get(r.MatchId)
	if err != nil {
		return err
	}
	ch, cancel := m.Subscribe(r.Round, r.After)
	defer cancel()
	for {
		select {
		case <-st.Context().Done():
			return nil
		case b, ok := <-ch:
			if !ok {
				return status.Error(codes.Aborted, "resubscribe")
			}
			hs := make([]*pb.ClientHash, len(b.Hashes))
			for i, h := range b.Hashes {
				hs[i] = &pb.ClientHash{Side: h.Side, Frame: h.Frame, Hash: h.Hash}
			}
			if err := st.Send(&pb.FrameBatch{Round: b.Round, First: b.First, Inputs: b.Inputs, Hashes: hs}); err != nil {
				return err
			}
		}
	}
}

func (s *Server) Health(context.Context, *pb.HealthRequest) (*pb.HealthResponse, error) {
	m, n := s.Reg.Counts()
	return &pb.HealthResponse{Matches: uint32(m), Sessions: uint32(n)}, nil
}
