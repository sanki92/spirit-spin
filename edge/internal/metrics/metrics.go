package metrics

import "github.com/prometheus/client_golang/prometheus"

var (
	Matches  = prometheus.NewGauge(prometheus.GaugeOpts{Name: "edge_matches", Help: "Live matches"})
	Sessions = prometheus.NewGauge(prometheus.GaugeOpts{Name: "edge_sessions", Help: "Attached player sessions"})
	In       = prometheus.NewCounter(prometheus.CounterOpts{Name: "edge_packets_in_total", Help: "Packets received from players"})
	Out      = prometheus.NewCounter(prometheus.CounterOpts{Name: "edge_packets_out_total", Help: "Frame packets sent to players"})
	Late     = prometheus.NewCounter(prometheus.CounterOpts{Name: "edge_late_inputs_total", Help: "Inputs that arrived after their frame was confirmed"})
	Missing  = prometheus.NewCounter(prometheus.CounterOpts{Name: "edge_missing_inputs_total", Help: "Frames confirmed with a repeated input"})
	Rounds   = prometheus.NewCounter(prometheus.CounterOpts{Name: "edge_rounds_total", Help: "Rounds ended"})
)

func init() { prometheus.MustRegister(Matches, Sessions, In, Out, Late, Missing, Rounds) }
