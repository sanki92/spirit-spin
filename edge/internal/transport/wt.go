package transport

import (
	"context"
	"crypto/tls"
	"net/http"
	"time"

	"github.com/quic-go/quic-go"
	"github.com/quic-go/quic-go/http3"
	"github.com/quic-go/webtransport-go"

	"spiritspin/edge/internal/match"
	"spiritspin/edge/internal/ticket"
)

func ServeWT(ctx context.Context, addr string, tc *tls.Config, reg *match.Registry, secret []byte, f Faults) error {
	mux := http.NewServeMux()
	h3 := &http3.Server{
		Addr:       addr,
		TLSConfig:  http3.ConfigureTLSConfig(tc),
		Handler:    mux,
		QUICConfig: &quic.Config{EnableDatagrams: true, EnableStreamResetPartialDelivery: true, KeepAlivePeriod: 5 * time.Second, MaxIdleTimeout: 20 * time.Second},
	}
	webtransport.ConfigureHTTP3Server(h3)
	s := &webtransport.Server{H3: h3, CheckOrigin: func(*http.Request) bool { return true }}
	mux.HandleFunc("/wt", func(w http.ResponseWriter, r *http.Request) {
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
		sess, err := s.Upgrade(w, r)
		if err != nil {
			return
		}
		p := newOutbox("wt", f.wrap(sess.SendDatagram), func() { _ = sess.CloseWithError(0, "closed") })
		m.Attach(c.S, p)
		go func() {
			defer func() {
				m.Detach(c.S, p)
				p.Close()
			}()
			for {
				b, err := sess.ReceiveDatagram(sess.Context())
				if err != nil {
					return
				}
				if !f.dropIn() {
					m.OnPacket(c.S, b)
				}
			}
		}()
	})
	go func() {
		<-ctx.Done()
		_ = s.Close()
	}()
	return s.ListenAndServe()
}
