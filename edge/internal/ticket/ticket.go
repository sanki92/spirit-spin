package ticket

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Claims struct {
	M string `json:"m"`
	S int    `json:"s"`
	E int64  `json:"e"`
}

var enc = base64.RawURLEncoding

func mac(secret []byte, payload string) string {
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(payload))
	return enc.EncodeToString(h.Sum(nil))
}

func Sign(secret []byte, c Claims) string {
	b, _ := json.Marshal(c)
	p := enc.EncodeToString(b)
	return p + "." + mac(secret, p)
}

func Verify(secret []byte, tok string, now time.Time) (Claims, error) {
	p, sig, ok := strings.Cut(tok, ".")
	if !ok || !hmac.Equal([]byte(sig), []byte(mac(secret, p))) {
		return Claims{}, errors.New("bad ticket")
	}
	raw, err := enc.DecodeString(p)
	if err != nil {
		return Claims{}, err
	}
	var c Claims
	if err := json.Unmarshal(raw, &c); err != nil {
		return Claims{}, err
	}
	if c.S != 0 && c.S != 1 {
		return Claims{}, errors.New("bad side")
	}
	if c.M == "" || now.UnixMilli() > c.E {
		return Claims{}, errors.New("expired")
	}
	return c, nil
}
