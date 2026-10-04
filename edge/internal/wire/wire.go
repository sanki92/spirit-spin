package wire

import (
	"encoding/binary"
	"math"
)

const (
	OpInput  byte = 1
	OpFrames byte = 2
	OpHash   byte = 3
	OpPing   byte = 4
	OpPong   byte = 5
)

type Input struct {
	X, Y int8
	Sp   uint8
}

type Frame [2]Input

type Msg struct {
	Op        byte
	Round     uint8
	First     uint32
	Ack       int32
	Margin    int16
	Frame     uint32
	Hash      uint32
	T, Server float64
	Inputs    []Input
	Frames    []Frame
}

var be = binary.BigEndian

func clamp(v int8) int8 {
	if v < -127 {
		return -127
	}
	return v
}

func put(b []byte, in Input) {
	b[0], b[1], b[2] = byte(clamp(in.X)), byte(clamp(in.Y)), in.Sp
}

func get(b []byte) Input { return Input{clamp(int8(b[0])), clamp(int8(b[1])), b[2]} }

func EncodeInput(round uint8, first uint32, ack int32, in []Input) []byte {
	b := make([]byte, 11+3*len(in))
	b[0], b[1] = OpInput, round
	be.PutUint32(b[2:], first)
	be.PutUint32(b[6:], uint32(ack))
	b[10] = byte(len(in))
	for i, v := range in {
		put(b[11+3*i:], v)
	}
	return b
}

func EncodeFrames(round uint8, first uint32, margin int, frames []Frame) []byte {
	if margin > 32767 {
		margin = 32767
	} else if margin < -32767 {
		margin = -32767
	}
	b := make([]byte, 9+6*len(frames))
	b[0], b[1] = OpFrames, round
	be.PutUint32(b[2:], first)
	be.PutUint16(b[6:], uint16(int16(margin)))
	b[8] = byte(len(frames))
	for i, f := range frames {
		put(b[9+6*i:], f[0])
		put(b[9+6*i+3:], f[1])
	}
	return b
}

func PackFrames(frames []Frame) []byte {
	b := make([]byte, 6*len(frames))
	for i, f := range frames {
		put(b[6*i:], f[0])
		put(b[6*i+3:], f[1])
	}
	return b
}

func EncodePong(t, server float64) []byte {
	b := make([]byte, 17)
	b[0] = OpPong
	be.PutUint64(b[1:], math.Float64bits(t))
	be.PutUint64(b[9:], math.Float64bits(server))
	return b
}

func Decode(b []byte) (Msg, bool) {
	if len(b) < 1 {
		return Msg{}, false
	}
	switch b[0] {
	case OpInput:
		if len(b) < 11 {
			return Msg{}, false
		}
		n := int(b[10])
		if n > 32 || len(b) != 11+3*n {
			return Msg{}, false
		}
		m := Msg{Op: OpInput, Round: b[1], First: be.Uint32(b[2:]), Ack: int32(be.Uint32(b[6:])), Inputs: make([]Input, n)}
		for i := range m.Inputs {
			m.Inputs[i] = get(b[11+3*i:])
		}
		return m, true
	case OpFrames:
		if len(b) < 9 {
			return Msg{}, false
		}
		n := int(b[8])
		if len(b) != 9+6*n {
			return Msg{}, false
		}
		m := Msg{Op: OpFrames, Round: b[1], First: be.Uint32(b[2:]), Margin: int16(be.Uint16(b[6:])), Frames: make([]Frame, n)}
		for i := range m.Frames {
			m.Frames[i] = Frame{get(b[9+6*i:]), get(b[12+6*i:])}
		}
		return m, true
	case OpHash:
		if len(b) != 10 {
			return Msg{}, false
		}
		return Msg{Op: OpHash, Round: b[1], Frame: be.Uint32(b[2:]), Hash: be.Uint32(b[6:])}, true
	case OpPing:
		if len(b) != 9 {
			return Msg{}, false
		}
		return Msg{Op: OpPing, T: math.Float64frombits(be.Uint64(b[1:]))}, true
	case OpPong:
		if len(b) != 17 {
			return Msg{}, false
		}
		return Msg{Op: OpPong, T: math.Float64frombits(be.Uint64(b[1:])), Server: math.Float64frombits(be.Uint64(b[9:]))}, true
	}
	return Msg{}, false
}
