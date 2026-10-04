package match

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"spiritspin/edge/internal/seq"
	"spiritspin/edge/internal/wire"
)

type countPeer struct{ n atomic.Int64 }

func (p *countPeer) Send([]byte)  { p.n.Add(1) }
func (p *countPeer) Kind() string { return "count" }
func (p *countPeer) Close()       {}

func TestLoad500Matches(t *testing.T) {
	if testing.Short() {
		t.Skip("load")
	}
	clock := func() float64 { return float64(time.Now().UnixNano()) / 1e6 }
	reg := NewRegistry(clock)
	const N = 500
	ms := make([]*Match, N)
	t0s := make([]float64, N)
	for i := range ms {
		ms[i] = reg.Create(fmt.Sprintf("L%d", i))
		ms[i].Attach(0, &countPeer{})
		ms[i].Attach(1, &countPeer{})
		t0s[i] = ms[i].StartRound(1, 100)
	}
	ctx, cancel := context.WithCancel(context.Background())
	go reg.Run(ctx, 2*time.Millisecond)
	var wg sync.WaitGroup
	end := time.Now().Add(3 * time.Second)
	for i := range ms {
		wg.Add(1)
		go func(m *Match, t0 float64) {
			defer wg.Done()
			for time.Now().Before(end) {
				f := uint32(max(0, (clock()-t0)/seq.TickMs)) + 4
				first := uint32(max(1, int(f)-7))
				in := make([]wire.Input, f-first+1)
				for i := range in {
					in[i] = wire.Input{X: 10, Y: -10}
				}
				for side := 0; side < 2; side++ {
					m.OnPacket(side, wire.EncodeInput(1, first, 0, in))
				}
				time.Sleep(16 * time.Millisecond)
			}
		}(ms[i], t0s[i])
	}
	wg.Wait()
	start := time.Now()
	for _, m := range ms {
		m.Tick()
	}
	pass := time.Since(start)
	cancel()
	var frames, missing uint64
	for _, m := range ms {
		st := m.EndRound(1)
		frames += uint64(st.Frames)
		missing += uint64(st.Missing[0] + st.Missing[1])
	}
	if frames < N*150 {
		t.Fatalf("too few frames confirmed: %d", frames)
	}
	if float64(missing) > 0.02*float64(2*frames) {
		t.Fatalf("missing %d of %d inputs", missing, 2*frames)
	}
	if pass > 30*time.Millisecond {
		t.Fatalf("one tick pass over %d matches took %v", N, pass)
	}
	t.Logf("frames %d missing %d (%.2f%%) tick pass %v", frames, missing, 100*float64(missing)/float64(2*frames), pass)
}
