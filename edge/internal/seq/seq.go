package seq

import (
	"math"

	"spiritspin/edge/internal/wire"
)

const (
	GraceMs      = 4.0
	MaxAhead     = 120
	MarginWindow = 30
)

var TickMs = 1000.0 / 60.0

type Sequencer struct {
	T0, Grace float64
	Frame     uint32
	Confirmed []wire.Frame
	Late      [2]uint32
	Missing   [2]uint32
	pending   [2]map[uint32]wire.Input
	hi        [2]uint32
	margins   [2][]float64
	last      [2]wire.Input
}

func New(t0 float64) *Sequencer {
	return &Sequencer{T0: t0, Grace: GraceMs, pending: [2]map[uint32]wire.Input{{}, {}}}
}

func (s *Sequencer) Deadline(f uint32) float64 { return s.T0 + float64(f)*TickMs + s.Grace }

func (s *Sequencer) Receive(side int, first uint32, in []wire.Input, now float64) {
	p := s.pending[side]
	for i, v := range in {
		f := first + uint32(i)
		if f < 1 {
			continue
		}
		fresh := f > s.hi[side]
		if fresh {
			if f <= s.Frame+MaxAhead {
				s.hi[side] = f
			}
			s.margins[side] = append(s.margins[side], s.Deadline(f)-now)
			if len(s.margins[side]) > MarginWindow {
				s.margins[side] = s.margins[side][1:]
			}
		}
		if f <= s.Frame {
			if fresh {
				s.Late[side]++
			}
		} else if f <= s.Frame+MaxAhead {
			if _, ok := p[f]; !ok {
				p[f] = v
			}
		}
	}
}

func (s *Sequencer) Due(now float64) int {
	n := 0
	for {
		f := s.Frame + 1
		a, okA := s.pending[0][f]
		b, okB := s.pending[1][f]
		if now < s.Deadline(f) {
			return n
		}
		if !okA {
			s.Missing[0]++
			a = s.last[0]
		}
		if !okB {
			s.Missing[1]++
			b = s.last[1]
		}
		delete(s.pending[0], f)
		delete(s.pending[1], f)
		s.last = [2]wire.Input{a, b}
		s.Confirmed = append(s.Confirmed, wire.Frame{a, b})
		s.Frame = f
		n++
	}
}

func (s *Sequencer) Hi(side int) uint32 { return s.hi[side] }

func (s *Sequencer) Margin(side int) int {
	m := s.margins[side]
	if len(m) == 0 {
		return 0
	}
	lo := m[0]
	for _, v := range m[1:] {
		lo = math.Min(lo, v)
	}
	return int(math.Floor(lo + 0.5))
}
