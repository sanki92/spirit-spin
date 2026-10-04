package transport

import (
	"math/rand/v2"
	"time"
)

type Faults struct {
	DropIn, DropOut   float64
	DelayMs, JitterMs int
}

func (f Faults) dropIn() bool { return f.DropIn > 0 && rand.Float64() < f.DropIn }

func (f Faults) wrap(write func([]byte) error) func([]byte) error {
	if f.DropOut == 0 && f.DelayMs == 0 && f.JitterMs == 0 {
		return write
	}
	return func(b []byte) error {
		if f.DropOut > 0 && rand.Float64() < f.DropOut {
			return nil
		}
		d := time.Duration(f.DelayMs) * time.Millisecond
		if f.JitterMs > 0 {
			d += time.Duration(rand.IntN(f.JitterMs)) * time.Millisecond
		}
		if d > 0 {
			time.AfterFunc(d, func() { _ = write(b) })
			return nil
		}
		return write(b)
	}
}
