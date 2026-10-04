package main

import (
	"context"
	"crypto/tls"
	"flag"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"spiritspin/edge/internal/match"
	"spiritspin/edge/internal/metrics"
	"spiritspin/edge/internal/rpc"
	"spiritspin/edge/internal/transport"
)

func main() {
	wtAddr := flag.String("wt", ":4433", "WebTransport UDP address")
	wsAddr := flag.String("ws", "127.0.0.1:4434", "WebSocket fallback address (behind the web proxy)")
	grpcAddr := flag.String("grpc", "127.0.0.1:4435", "gRPC address (private)")
	metricsAddr := flag.String("metrics", "127.0.0.1:4436", "Prometheus address")
	certFile := flag.String("cert", "", "TLS certificate (production)")
	keyFile := flag.String("key", "", "TLS key (production)")
	hosts := flag.String("hosts", "localhost,127.0.0.1", "dev certificate hosts")
	drainFor := flag.Duration("drain", 10*time.Minute, "how long to wait for live matches on shutdown")
	var f transport.Faults
	flag.Float64Var(&f.DropIn, "drop-in", 0, "drop incoming packets (0..1)")
	flag.Float64Var(&f.DropOut, "drop-out", 0, "drop outgoing packets (0..1)")
	flag.IntVar(&f.DelayMs, "delay-ms", 0, "added outgoing delay")
	flag.IntVar(&f.JitterMs, "jitter-ms", 0, "added outgoing jitter")
	flag.Parse()
	secret := os.Getenv("RT_EDGE_SECRET")
	if len(secret) < 16 {
		slog.Error("RT_EDGE_SECRET must be set (16+ chars)")
		os.Exit(1)
	}
	var cert tls.Certificate
	certHash := ""
	var err error
	if *certFile != "" {
		cert, err = tls.LoadX509KeyPair(*certFile, *keyFile)
	} else {
		cert, certHash, err = transport.DevCert(strings.Split(*hosts, ","))
	}
	if err != nil {
		slog.Error("certificate", "err", err)
		os.Exit(1)
	}
	sig, stopSig := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSig()
	run, stopRun := context.WithCancel(context.Background())
	defer stopRun()
	reg := match.NewRegistry(func() float64 { return float64(time.Now().UnixNano()) / 1e6 })
	go reg.Run(run, 2*time.Millisecond)
	go func() {
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-run.Done():
				return
			case <-t.C:
				m, s := reg.Counts()
				metrics.Matches.Set(float64(m))
				metrics.Sessions.Set(float64(s))
			}
		}
	}()
	go func() {
		if err := transport.ServeWT(run, *wtAddr, &tls.Config{Certificates: []tls.Certificate{cert}}, reg, []byte(secret), f); err != nil && run.Err() == nil {
			slog.Error("webtransport", "err", err)
		}
	}()
	wsSrv := &http.Server{Addr: *wsAddr, Handler: transport.WSHandler(reg, []byte(secret), f), ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = wsSrv.ListenAndServe() }()
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	mSrv := &http.Server{Addr: *metricsAddr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = mSrv.ListenAndServe() }()
	l, err := net.Listen("tcp", *grpcAddr)
	if err != nil {
		slog.Error("grpc listen", "err", err)
		os.Exit(1)
	}
	srv := &rpc.Server{Reg: reg, CertHash: certHash}
	g := rpc.NewGRPC(srv, secret)
	go func() { _ = g.Serve(l) }()
	slog.Info("edge up", "wt", *wtAddr, "ws", *wsAddr, "grpc", *grpcAddr, "metrics", *metricsAddr, "devCert", certHash != "")
	<-sig.Done()
	srv.Draining.Store(true)
	slog.Info("draining")
	deadline := time.Now().Add(*drainFor)
	for time.Now().Before(deadline) {
		if m, _ := reg.Counts(); m == 0 {
			break
		}
		time.Sleep(time.Second)
	}
	stopped := make(chan struct{})
	go func() {
		g.GracefulStop()
		close(stopped)
	}()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		g.Stop()
	}
	stopRun()
	sd, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = wsSrv.Shutdown(sd)
	_ = mSrv.Shutdown(sd)
	slog.Info("edge stopped")
}
