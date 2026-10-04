package transport

import (
	"context"
	"crypto/tls"
	"net"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"

	"spiritspin/edge/internal/match"
	"spiritspin/edge/internal/ticket"
	"spiritspin/edge/internal/wire"
)

var secret = []byte("s3cret")

func tok(m string, s int) string {
	return ticket.Sign(secret, ticket.Claims{M: m, S: s, E: time.Now().Add(time.Minute).UnixMilli()})
}

func clock() float64 { return float64(time.Now().UnixNano()) / 1e6 }

func in(x, y int8) wire.Input { return wire.Input{X: x, Y: y} }

func TestWebSocketFallbackRoundTrip(t *testing.T) {
	reg := match.NewRegistry(clock)
	m := reg.Create("WS1")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go reg.Run(ctx, 2*time.Millisecond)
	srv := httptest.NewServer(WSHandler(reg, secret, Faults{}))
	defer srv.Close()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws?t="
	if _, _, err := websocket.Dial(ctx, url+"bad", nil); err == nil {
		t.Fatal("bad ticket accepted")
	}
	if _, _, err := websocket.Dial(ctx, url+tok("NOPE", 0), nil); err == nil {
		t.Fatal("unknown match accepted")
	}
	c, _, err := websocket.Dial(ctx, url+tok("WS1", 0), nil)
	if err != nil {
		t.Fatal(err)
	}
	m.StartRound(1, 0)
	_ = c.Write(ctx, websocket.MessageBinary, wire.EncodeInput(1, 1, 0, []wire.Input{in(9, 0)}))
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		rctx, rc := context.WithTimeout(ctx, time.Second)
		_, b, err := c.Read(rctx)
		rc()
		if err != nil {
			t.Fatal(err)
		}
		if msg, ok := wire.Decode(b); ok && msg.Op == wire.OpFrames && len(msg.Frames) > 0 && msg.Frames[0][0].X == 9 {
			return
		}
	}
	t.Fatal("no confirmed frame with our input")
}

func TestEdgeDropsGarbageDatagrams(t *testing.T) {
	reg := match.NewRegistry(clock)
	m := reg.Create("WT1")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go reg.Run(ctx, 2*time.Millisecond)
	cert, hash, err := DevCert([]string{"127.0.0.1", "localhost"})
	if err != nil || len(hash) != 64 {
		t.Fatalf("cert %v %q", err, hash)
	}
	l, _ := net.ListenPacket("udp", "127.0.0.1:0")
	addr := l.LocalAddr().String()
	l.Close()
	go func() {
		_ = ServeWT(ctx, addr, &tls.Config{Certificates: []tls.Certificate{cert}}, reg, secret, Faults{})
	}()
	time.Sleep(300 * time.Millisecond)
	cl := &webtransport.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true, NextProtos: []string{http3.NextProtoH3}},
		QUICConfig:      &quic.Config{EnableDatagrams: true, EnableStreamResetPartialDelivery: true},
	}
	defer cl.Close()
	dctx, dc := context.WithTimeout(ctx, 5*time.Second)
	defer dc()
	rsp, sess, err := cl.Dial(dctx, "https://"+addr+"/wt?t="+tok("WT1", 1), nil)
	if err != nil {
		t.Fatal(err)
	}
	if rsp.StatusCode != 200 {
		t.Fatalf("status %d", rsp.StatusCode)
	}
	m.StartRound(1, 0)
	_ = sess.SendDatagram([]byte{9, 9, 9})
	_ = sess.SendDatagram([]byte{1})
	_ = sess.SendDatagram(wire.EncodeInput(1, 1, 0, []wire.Input{in(0, 7)}))
	rctx, rc := context.WithTimeout(ctx, 3*time.Second)
	defer rc()
	for {
		b, err := sess.ReceiveDatagram(rctx)
		if err != nil {
			t.Fatal(err)
		}
		if msg, ok := wire.Decode(b); ok && msg.Op == wire.OpFrames && len(msg.Frames) > 0 && msg.Frames[0][1].Y == 7 {
			return
		}
	}
}

func TestOutboxDropsWhenFullInsteadOfBlocking(t *testing.T) {
	block := make(chan struct{})
	o := newOutbox("x", func([]byte) error { <-block; return nil }, func() {})
	done := make(chan struct{})
	go func() {
		for i := 0; i < 1000; i++ {
			o.Send([]byte{1})
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Send blocked on a slow peer")
	}
	close(block)
	o.Close()
	o.Send([]byte{1})
	o.Close()
}

func TestLimiterAllowsABurstThenSheds(t *testing.T) {
	now := time.Unix(0, 0)
	l := newLimiter(now)
	ok := 0
	for i := 0; i < 1000; i++ {
		if l.allow(now) {
			ok++
		}
	}
	if ok != limitBurst {
		t.Fatalf("burst allowed %d, want %d", ok, limitBurst)
	}
	if l.flooding() != true {
		t.Fatal("a 1000-packet instant burst must count as a flood")
	}
	later := now.Add(time.Second)
	if !l.allow(later) {
		t.Fatal("tokens must refill over time")
	}
}
