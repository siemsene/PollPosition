import { customAlphabet } from "nanoid"

// avoid confusing chars in room codes (0/O, 1/I)
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
export const roomCode = customAlphabet(alphabet, 6)
