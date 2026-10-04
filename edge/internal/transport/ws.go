package transport

import (
	"context"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"spiritspin/edge/internal/match"
	"spiritspin/edge/internal/ticket"
)

func WSHandler(reg *match.Registry, secret []byte, f Faults) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		c, err := ticket.Verify(secret, r.URL.Query().Get("t"), time.Now())
		if err != nil {
			http.Error(w, "ticket", http.StatusForbidden)
			return
		}
		m := reg.Get(c.M)
		if m == nil {
			http.Error(w, "match", http.StatusNotFound)
			return
		}
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		conn.SetReadLimit(4096)
		ctx, cancel := context.WithCancel(context.Background())
		write := func(b []byte) error {
			wc, done := context.WithTimeout(ctx, time.Second)
			defer done()
			return conn.Write(wc, websocket.MessageBinary, b)
		}
		p := newOutbox("ws", f.wrap(write), func() {
			cancel()
			_ = conn.Close(websocket.StatusNormalClosure, "closed")
		})
		m.Attach(c.S, p)
		defer func() {
			m.Detach(c.S, p)
			p.Close()
		}()
		for {
			typ, b, err := conn.Read(ctx)
			if err != nil {
				return
			}
			if typ == websocket.MessageBinary && !f.dropIn() {
				m.OnPacket(c.S, b)
			}
		}
	})
	return mux
}
