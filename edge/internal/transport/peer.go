package transport

import "sync"

const outboxCap = 8

type outbox struct {
	mu     sync.Mutex
	ch     chan []byte
	closed bool
	kind   string
	stop   func()
}

func newOutbox(kind string, write func([]byte) error, stop func()) *outbox {
	o := &outbox{ch: make(chan []byte, outboxCap), kind: kind, stop: stop}
	go func() {
		for b := range o.ch {
			if write(b) != nil {
				o.Close()
				return
			}
		}
	}()
	return o
}

func (o *outbox) Send(b []byte) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.closed {
		return
	}
	for {
		select {
		case o.ch <- b:
			return
		default:
		}
		select {
		case <-o.ch:
		default:
		}
	}
}

func (o *outbox) Kind() string { return o.kind }

func (o *outbox) Close() {
	o.mu.Lock()
	if o.closed {
		o.mu.Unlock()
		return
	}
	o.closed = true
	close(o.ch)
	o.mu.Unlock()
	o.stop()
}
