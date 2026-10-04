package transport

import "time"

const (
	limitRate  = 240.0
	limitBurst = 120
	floodDrops = 4 * limitBurst
)

type limiter struct {
	tokens  float64
	last    time.Time
	dropped int
}

func newLimiter(now time.Time) *limiter { return &limiter{tokens: limitBurst, last: now} }

func (l *limiter) allow(now time.Time) bool {
	l.tokens = min(limitBurst, l.tokens+now.Sub(l.last).Seconds()*limitRate)
	l.last = now
	if l.tokens >= 1 {
		l.tokens--
		if l.dropped > 0 {
			l.dropped--
		}
		return true
	}
	l.dropped++
	return false
}

func (l *limiter) flooding() bool { return l.dropped >= floodDrops }
