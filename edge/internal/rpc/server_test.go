package rpc

import (
	"context"
	"net"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"

	pb "spiritspin/edge/gen/edgev1"
	"spiritspin/edge/internal/match"
)

func start(t *testing.T) (pb.EdgeClient, func()) {
	reg := match.NewRegistry(func() float64 { return float64(time.Now().UnixNano()) / 1e6 })
	ctx, cancel := context.WithCancel(context.Background())
	go reg.Run(ctx, 2*time.Millisecond)
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	g := NewGRPC(&Server{Reg: reg, CertHash: "abc"}, "tok")
	go func() { _ = g.Serve(l) }()
	conn, err := grpc.NewClient(l.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	return pb.NewEdgeClient(conn), func() { cancel(); g.Stop(); conn.Close() }
}

func TestRejectsMissingToken(t *testing.T) {
	c, stop := start(t)
	defer stop()
	if _, err := c.Health(context.Background(), &pb.HealthRequest{}); err == nil {
		t.Fatal("unauthenticated call accepted")
	}
	bad := metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer nope")
	if _, err := c.Health(bad, &pb.HealthRequest{}); err == nil {
		t.Fatal("wrong token accepted")
	}
}

func TestMatchLifecycleAndStream(t *testing.T) {
	c, stop := start(t)
	defer stop()
	ctx := metadata.AppendToOutgoingContext(context.Background(), "authorization", "Bearer tok")
	cm, err := c.CreateMatch(ctx, &pb.CreateMatchRequest{MatchId: "R1"})
	if err != nil || cm.CertHash != "abc" {
		t.Fatalf("%v %+v", err, cm)
	}
	sr, err := c.StartRound(ctx, &pb.StartRoundRequest{MatchId: "R1", Round: 1, LeadInMs: 0})
	if err != nil || sr.T0 <= 0 {
		t.Fatalf("%v %+v", err, sr)
	}
	sctx, scancel := context.WithTimeout(ctx, 2*time.Second)
	defer scancel()
	st, err := c.StreamFrames(sctx, &pb.StreamFramesRequest{MatchId: "R1", Round: 1, After: 0})
	if err != nil {
		t.Fatal(err)
	}
	b, err := st.Recv()
	if err != nil || b.Round != 1 || b.First != 1 || len(b.Inputs)%6 != 0 || len(b.Inputs) == 0 {
		t.Fatalf("%v %+v", err, b)
	}
	er, err := c.EndRound(ctx, &pb.EndRoundRequest{MatchId: "R1", Round: 1})
	if err != nil || er.Stats.Frames == 0 {
		t.Fatalf("%v %+v", err, er)
	}
	if _, err := c.EndMatch(ctx, &pb.EndMatchRequest{MatchId: "R1"}); err != nil {
		t.Fatal(err)
	}
	h, _ := c.Health(ctx, &pb.HealthRequest{})
	if h.Matches != 0 {
		t.Fatalf("matches %d", h.Matches)
	}
	if _, err := c.StartRound(ctx, &pb.StartRoundRequest{MatchId: "nope", Round: 1}); err == nil {
		t.Fatal("unknown match accepted")
	}
	if _, err := c.CreateMatch(ctx, &pb.CreateMatchRequest{MatchId: ""}); err == nil {
		t.Fatal("empty match id accepted")
	}
}

func TestDrainingRefusesNewMatches(t *testing.T) {
	reg := match.NewRegistry(func() float64 { return float64(time.Now().UnixNano()) / 1e6 })
	s := &Server{Reg: reg}
	s.Draining.Store(true)
	if _, err := s.CreateMatch(context.Background(), &pb.CreateMatchRequest{MatchId: "X"}); err == nil {
		t.Fatal("draining edge accepted a match")
	}
}
