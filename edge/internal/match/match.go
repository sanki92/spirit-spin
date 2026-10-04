package match

import (
	"context"
	"sync"
	"time"

	"spiritspin/edge/internal/metrics"
	"spiritspin/edge/internal/seq"
	"spiritspin/edge/internal/wire"
)

type Peer interface {
	Send(b []byte)
	Kind() string
	Close()
}

type Hash struct{ Side, Frame, Hash uint32 }

type Batch struct {
	Round, First uint32
	Inputs       []byte
	Hashes       []Hash
	InputHi      [2]uint32
}

type Stats struct {
	Frames     uint32
	Late       [2]uint32
	Missing    [2]uint32
	Margins    [2]int
	In, Out    uint64
	Transports [2]string
}

const (
	window    = 150
	keepAlive = 50.0
	subBuffer = 4096
	maxHashes = 64
	maxFrames = 6000
	orphanMs  = 2 * 60 * 1000
	idleMs    = 10 * 60 * 1000
)

type Match struct {
	ID       string
	mu       sync.Mutex
	now      func() float64
	round    uint32
	seq      *seq.Sequencer
	peers    [2]Peer
	acked    [2]uint32
	streamed uint32
	hashes   []Hash
	sub      chan Batch
	lastSend float64
	in, out  uint64
	touched  float64
}

func New(id string, now func() float64) *Match { return &Match{ID: id, now: now, touched: now()} }

func (m *Match) StartRound(round uint32, leadInMs float64) float64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.touched = m.now()
	t0 := m.touched + leadInMs
	m.round, m.seq = round, seq.New(t0)
	m.acked, m.streamed, m.hashes, m.in, m.out, m.lastSend = [2]uint32{}, 0, nil, 0, 0, 0
	return t0
}

func (m *Match) EndRound(round uint32) Stats {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.touched = m.now()
	st := Stats{In: m.in, Out: m.out}
	for i, p := range m.peers {
		if p != nil {
			st.Transports[i] = p.Kind()
		}
	}
	if m.seq != nil && m.round == round {
		st.Frames, st.Late, st.Missing = m.seq.Frame, m.seq.Late, m.seq.Missing
		st.Margins = [2]int{m.seq.Margin(0), m.seq.Margin(1)}
		m.seq = nil
		metrics.Rounds.Inc()
		metrics.Late.Add(float64(st.Late[0] + st.Late[1]))
		metrics.Missing.Add(float64(st.Missing[0] + st.Missing[1]))
	}
	return st
}

func (m *Match) Attach(side int, p Peer) {
	m.mu.Lock()
	old := m.peers[side]
	m.peers[side] = p
	m.acked[side] = 0
	m.mu.Unlock()
	if old != nil && old != p {
		old.Close()
	}
}

func (m *Match) Detach(side int, p Peer) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.peers[side] == p {
		m.peers[side] = nil
	}
}

func (m *Match) OnPacket(side int, b []byte) {
	msg, ok := wire.Decode(b)
	if !ok {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.in++
	metrics.In.Inc()
	switch msg.Op {
	case wire.OpPing:
		if p := m.peers[side]; p != nil {
			p.Send(wire.EncodePong(msg.T, m.now()))
		}
	case wire.OpInput:
		if m.seq == nil || msg.Round != uint8(m.round) {
			return
		}
		if msg.Ack >= 0 && uint32(msg.Ack) <= m.seq.Frame {
			m.acked[side] = uint32(msg.Ack)
		}
		m.seq.Receive(side, msg.First, msg.Inputs, m.now())
	case wire.OpHash:
		if m.seq != nil && msg.Round == uint8(m.round) && len(m.hashes) < maxHashes {
			m.hashes = append(m.hashes, Hash{uint32(side), msg.Frame, msg.Hash})
		}
	}
}

func (m *Match) Tick() {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.seq == nil {
		return
	}
	now := m.now()
	n := m.seq.Due(now)
	if m.seq.Frame >= maxFrames {
		m.seq = nil
		return
	}
	if n > 0 || now-m.lastSend >= keepAlive {
		m.lastSend = now
		total := len(m.seq.Confirmed)
		for side, p := range m.peers {
			if p == nil {
				continue
			}
			lo := min(int(m.acked[side]), total)
			hi := min(lo+window, total)
			p.Send(wire.EncodeFrames(uint8(m.round), uint32(lo)+1, m.seq.Margin(side), m.seq.Confirmed[lo:hi]))
			m.out++
			metrics.Out.Inc()
		}
	}
	if m.sub != nil && (m.streamed < m.seq.Frame || len(m.hashes) > 0) {
		b := Batch{Round: m.round, First: m.streamed + 1, Inputs: wire.PackFrames(m.seq.Confirmed[m.streamed:m.seq.Frame]), Hashes: m.hashes, InputHi: [2]uint32{m.seq.Hi(0), m.seq.Hi(1)}}
		select {
		case m.sub <- b:
			m.streamed, m.hashes = m.seq.Frame, nil
		default:
			close(m.sub)
			m.sub = nil
		}
	}
}

func (m *Match) Subscribe(round, after uint32) (<-chan Batch, func()) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sub != nil {
		close(m.sub)
	}
	m.touched = m.now()
	ch := make(chan Batch, subBuffer)
	m.sub = ch
	if m.seq != nil && m.round == round {
		after = min(after, m.seq.Frame)
		if after < m.seq.Frame {
			ch <- Batch{Round: round, First: after + 1, Inputs: wire.PackFrames(m.seq.Confirmed[after:m.seq.Frame]), InputHi: [2]uint32{m.seq.Hi(0), m.seq.Hi(1)}}
		}
		m.streamed = m.seq.Frame
	}
	return ch, func() {
		m.mu.Lock()
		defer m.mu.Unlock()
		if m.sub == ch {
			close(ch)
			m.sub = nil
		}
	}
}

func (m *Match) sessions() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, p := range m.peers {
		if p != nil {
			n++
		}
	}
	return n
}

type Registry struct {
	mu  sync.Mutex
	m   map[string]*Match
	now func() float64
}

func NewRegistry(now func() float64) *Registry { return &Registry{m: map[string]*Match{}, now: now} }

func (r *Registry) Create(id string) *Match {
	r.mu.Lock()
	defer r.mu.Unlock()
	if m, ok := r.m[id]; ok {
		return m
	}
	m := New(id, r.now)
	r.m[id] = m
	return m
}

func (r *Registry) Get(id string) *Match {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.m[id]
}

func (r *Registry) Delete(id string) {
	r.mu.Lock()
	m := r.m[id]
	delete(r.m, id)
	r.mu.Unlock()
	if m == nil {
		return
	}
	m.mu.Lock()
	peers := m.peers
	m.peers = [2]Peer{}
	m.seq = nil
	if m.sub != nil {
		close(m.sub)
		m.sub = nil
	}
	m.mu.Unlock()
	for _, p := range peers {
		if p != nil {
			p.Close()
		}
	}
}

func (m *Match) reapable(now float64) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.sub != nil {
		return false
	}
	if m.seq != nil {
		return now-m.touched > orphanMs
	}
	return now-m.touched > idleMs
}

func (r *Registry) Reap() {
	now := r.now()
	for _, m := range r.all() {
		if m.reapable(now) {
			r.Delete(m.ID)
		}
	}
}

func (r *Registry) all() []*Match {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*Match, 0, len(r.m))
	for _, m := range r.m {
		out = append(out, m)
	}
	return out
}

func (r *Registry) Counts() (int, int) {
	ms := r.all()
	s := 0
	for _, m := range ms {
		s += m.sessions()
	}
	return len(ms), s
}

func (r *Registry) Run(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	reap := time.NewTicker(time.Second)
	defer reap.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-reap.C:
			r.Reap()
		case <-t.C:
			for _, m := range r.all() {
				m.Tick()
			}
		}
	}
}
