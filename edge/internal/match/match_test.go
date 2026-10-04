package match

import (
	"sync"
	"testing"

	"spiritspin/edge/internal/seq"
	"spiritspin/edge/internal/wire"
)

type fakePeer struct {
	mu  sync.Mutex
	got []wire.Msg
}

func (p *fakePeer) Send(b []byte) {
	m, ok := wire.Decode(b)
	if ok {
		p.mu.Lock()
		p.got = append(p.got, m)
		p.mu.Unlock()
	}
}
func (p *fakePeer) Kind() string { return "fake" }
func (p *fakePeer) Close()       {}
func (p *fakePeer) frames() []wire.Msg {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []wire.Msg
	for _, m := range p.got {
		if m.Op == wire.OpFrames {
			out = append(out, m)
		}
	}
	return out
}
func (p *fakePeer) withFrames() []wire.Msg {
	var out []wire.Msg
	for _, m := range p.frames() {
		if len(m.Frames) > 0 {
			out = append(out, m)
		}
	}
	return out
}

func setup() (*Match, *fakePeer, *fakePeer, *float64) {
	now := 1000.0
	m := New("M1", func() float64 { return now })
	a, b := &fakePeer{}, &fakePeer{}
	m.Attach(0, a)
	m.Attach(1, b)
	return m, a, b, &now
}

func at(t0 float64, f uint32) float64 { return t0 + float64(f)*seq.TickMs + seq.GraceMs }

func TestConfirmsAndSendsAckWindow(t *testing.T) {
	m, a, b, now := setup()
	t0 := m.StartRound(1, 600)
	*now = t0
	m.OnPacket(0, wire.EncodeInput(1, 1, 0, []wire.Input{in(5)}))
	m.OnPacket(1, wire.EncodeInput(1, 1, 0, []wire.Input{in(-5)}))
	m.Tick()
	fa := a.withFrames()
	if len(fa) != 1 || fa[0].First != 1 || len(fa[0].Frames) != 1 || fa[0].Frames[0][0].X != 5 {
		t.Fatalf("a got %+v", fa)
	}
	if len(b.withFrames()) != 1 {
		t.Fatal("b got nothing")
	}
	*now = at(t0, 40)
	m.Tick()
	last := a.withFrames()[len(a.withFrames())-1]
	if last.First != 1 || len(last.Frames) != 16 {
		t.Fatalf("window %d+%d", last.First, len(last.Frames))
	}
	m.OnPacket(0, wire.EncodeInput(1, 41, 30, nil))
	*now = at(t0, 41)
	m.Tick()
	last = a.withFrames()[len(a.withFrames())-1]
	if last.First != 31 || len(last.Frames) != 11 {
		t.Fatalf("after ack %d+%d", last.First, len(last.Frames))
	}
}

func TestPingGarbageAndOtherRound(t *testing.T) {
	m, a, _, now := setup()
	t0 := m.StartRound(2, 600)
	*now = t0
	m.OnPacket(0, append([]byte{4}, make([]byte, 8)...))
	m.OnPacket(0, []byte{9, 9, 9})
	m.OnPacket(0, wire.EncodeInput(1, 1, 0, []wire.Input{in(5)}))
	if a.got[0].Op != wire.OpPong || a.got[0].Server != t0 {
		t.Fatalf("pong %+v", a.got[0])
	}
	m.OnPacket(1, wire.EncodeInput(2, 1, 0, []wire.Input{in(1)}))
	m.Tick()
	if len(a.withFrames()) != 0 {
		t.Fatal("round-1 input confirmed a round-2 frame")
	}
}

func TestStreamCarriesFramesHashesAndBacklog(t *testing.T) {
	m, _, _, now := setup()
	t0 := m.StartRound(1, 600)
	*now = at(t0, 10)
	m.Tick()
	ch, cancel := m.Subscribe(1, 4)
	defer cancel()
	first := <-ch
	if first.First != 5 || len(first.Inputs) != 6*6 {
		t.Fatalf("backlog %+v", first)
	}
	m.OnPacket(1, wire.EncodeInput(1, 0, 0, nil))
	m.OnPacket(1, []byte{3, 1, 0, 0, 0, 60, 0, 0, 0, 7})
	*now = at(t0, 11)
	m.Tick()
	b := <-ch
	if b.First != 11 || len(b.Hashes) != 1 || b.Hashes[0] != (Hash{1, 60, 7}) {
		t.Fatalf("batch %+v", b)
	}
}

func TestReattachReplacesPeerAndEndRoundStops(t *testing.T) {
	m, a, _, now := setup()
	t0 := m.StartRound(1, 600)
	a2 := &fakePeer{}
	m.Attach(0, a2)
	m.Detach(0, a)
	*now = at(t0, 3)
	m.Tick()
	if len(a.frames()) != 0 || len(a2.withFrames()) == 0 {
		t.Fatal("old peer still receives")
	}
	st := m.EndRound(1)
	if st.Frames != 3 || st.Missing != [2]uint32{3, 3} {
		t.Fatalf("stats %+v", st)
	}
	*now = at(t0, 10)
	m.Tick()
	if m.seq != nil {
		t.Fatal("sequencer still running")
	}
}

func TestPoisonedFirstFrameDoesNotFreezeMargins(t *testing.T) {
	m, _, _, now := setup()
	t0 := m.StartRound(1, 600)
	*now = t0
	m.OnPacket(0, wire.EncodeInput(1, 4000000000, 0, []wire.Input{in(1)}))
	m.OnPacket(0, wire.EncodeInput(1, 1, 0, []wire.Input{in(1)}))
	if m.seq.Margin(0) > 1000 {
		t.Fatalf("margin frozen by far-future input: %d", m.seq.Margin(0))
	}
}

func in(x int8) wire.Input { return wire.Input{X: x} }
