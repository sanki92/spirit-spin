package seq

import (
	"encoding/json"
	"os"
	"testing"

	"spiritspin/edge/internal/wire"
)

type op struct {
	Op      string  `json:"op"`
	Side    int     `json:"side"`
	First   uint32  `json:"first"`
	Now     float64 `json:"now"`
	Inputs  [][]int `json:"inputs"`
	N       int     `json:"n"`
	Margins [2]int  `json:"margins"`
}

type trace struct {
	T0        float64   `json:"t0"`
	Grace     float64   `json:"grace"`
	Ops       []op      `json:"ops"`
	Confirmed [][]int   `json:"confirmed"`
	Late      [2]uint32 `json:"late"`
	Missing   [2]uint32 `json:"missing"`
}

func TestGoldenTraceParityWithTypeScript(t *testing.T) {
	raw, err := os.ReadFile("../../../packages/core/src/netcode/fixtures/seq-trace.json")
	if err != nil {
		t.Fatal(err)
	}
	var tr trace
	if err := json.Unmarshal(raw, &tr); err != nil {
		t.Fatal(err)
	}
	s := New(tr.T0)
	s.Grace = tr.Grace
	for i, o := range tr.Ops {
		if o.Op == "recv" {
			in := make([]wire.Input, len(o.Inputs))
			for j, v := range o.Inputs {
				in[j] = wire.Input{X: int8(v[0]), Y: int8(v[1]), Sp: uint8(v[2])}
			}
			s.Receive(o.Side, o.First, in, o.Now)
			continue
		}
		if n := s.Due(o.Now); n != o.N {
			t.Fatalf("op %d due n=%d want %d", i, n, o.N)
		}
		if m := [2]int{s.Margin(0), s.Margin(1)}; m != o.Margins {
			t.Fatalf("op %d margins %v want %v", i, m, o.Margins)
		}
	}
	if len(s.Confirmed) != len(tr.Confirmed) {
		t.Fatalf("confirmed %d want %d", len(s.Confirmed), len(tr.Confirmed))
	}
	for i, f := range s.Confirmed {
		got := []int{int(f[0].X), int(f[0].Y), int(f[0].Sp), int(f[1].X), int(f[1].Y), int(f[1].Sp)}
		for k := range got {
			if got[k] != tr.Confirmed[i][k] {
				t.Fatalf("frame %d = %v want %v", i+1, got, tr.Confirmed[i])
			}
		}
	}
	if s.Late != tr.Late || s.Missing != tr.Missing {
		t.Fatalf("late %v missing %v want %v %v", s.Late, s.Missing, tr.Late, tr.Missing)
	}
}
