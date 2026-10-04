package ticket

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

func TestSignVerify(t *testing.T) {
	sec := []byte("test-secret")
	tok := Sign(sec, Claims{M: "ROOM1-ab", S: 1, E: time.Now().Add(time.Minute).UnixMilli()})
	c, err := Verify(sec, tok, time.Now())
	if err != nil || c.M != "ROOM1-ab" || c.S != 1 {
		t.Fatalf("%v %+v", err, c)
	}
	if _, err := Verify([]byte("other"), tok, time.Now()); err == nil {
		t.Fatal("wrong secret accepted")
	}
	if _, err := Verify(sec, tok, time.Now().Add(2*time.Minute)); err == nil {
		t.Fatal("expired accepted")
	}
	if _, err := Verify(sec, tok+"x", time.Now()); err == nil {
		t.Fatal("tampered accepted")
	}
	if _, err := Verify(sec, "", time.Now()); err == nil {
		t.Fatal("empty accepted")
	}
	bad := Sign(sec, Claims{M: "X", S: 2, E: time.Now().Add(time.Minute).UnixMilli()})
	if _, err := Verify(sec, bad, time.Now()); err == nil {
		t.Fatal("side 2 accepted")
	}
}

func TestNodeGolden(t *testing.T) {
	raw, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Skip("golden written by apps/server tickets.test.ts (Task 16)")
	}
	var g struct {
		Secret string `json:"secret"`
		Token  string `json:"token"`
		M      string `json:"m"`
		S      int    `json:"s"`
	}
	_ = json.Unmarshal(raw, &g)
	c, err := Verify([]byte(g.Secret), g.Token, time.UnixMilli(1))
	if err != nil || c.M != g.M || c.S != g.S {
		t.Fatalf("node ticket rejected: %v %+v", err, c)
	}
}
