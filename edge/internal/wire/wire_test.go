package wire

import (
	"encoding/hex"
	"testing"
)

func h(b []byte) string { return hex.EncodeToString(b) }
func uh(s string) []byte { b, _ := hex.DecodeString(s); return b }

func TestGolden(t *testing.T) {
	if got := h(EncodeInput(2, 300, 298, []Input{{127, -127, 3}})); got != "01020000012c0000012a017f8103" {
		t.Fatalf("input %s", got)
	}
	if got := h(EncodeFrames(1, 5, -12, []Frame{{{1, 2, 0}, {-1, 0, 9}}})); got != "020100000005fff401010200ff0009" {
		t.Fatalf("frames %s", got)
	}
	if got := h(PackFrames([]Frame{{{1, 2, 0}, {-1, 0, 9}}})); got != "010200ff0009" {
		t.Fatalf("pack %s", got)
	}
}

func TestDecode(t *testing.T) {
	m, ok := Decode(uh("030300000078deadbeef"))
	if !ok || m.Op != OpHash || m.Round != 3 || m.Frame != 120 || m.Hash != 0xdeadbeef {
		t.Fatalf("hash %+v", m)
	}
	m, ok = Decode(uh("0101000000010000000001808003"))
	if !ok || m.Inputs[0] != (Input{-127, -127, 3}) {
		t.Fatalf("clamp %+v", m)
	}
	for _, bad := range []string{"", "09", "01020000012c0000012a027f8103", "01020000012c0000012a017f810300", "0303000000"} {
		if _, ok := Decode(uh(bad)); ok {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, ok := Decode(append([]byte{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 33}, make([]byte, 99)...)); ok {
		t.Fatal("accepted n=33")
	}
	p, ok := Decode(append([]byte{4}, uh("40c81cd6c8b43958")...))
	if !ok || p.Op != OpPing || p.T != 12345.678 {
		t.Fatalf("ping %+v", p)
	}
	q, ok := Decode(EncodePong(1.5, 2.5))
	if !ok || q.Op != OpPong || q.T != 1.5 || q.Server != 2.5 {
		t.Fatalf("pong %+v", q)
	}
}

func TestMarginClamp(t *testing.T) {
	m, _ := Decode(EncodeFrames(1, 1, 99999, nil))
	if m.Margin != 32767 {
		t.Fatal(m.Margin)
	}
}
