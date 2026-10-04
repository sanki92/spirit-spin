package match

const (
	limitRate  = 240.0
	limitBurst = 120
	floodDrops = 4 * limitBurst
)

type limiter struct {
	tokens, last float64
	dropped      int
}

func (l *limiter) allow(now float64) bool {
	l.tokens = min(limitBurst, l.tokens+max(0, now-l.last)*limitRate/1000)
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
