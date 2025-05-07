use aiken/crypto.{sha2_256}
use aiken/collection/list
use aiken/primitive/bytearray.{test_bit}

pub type LamportPublicKey {
  pk_left: List<ByteArray>,
  pk_right: List<ByteArray> 
}

pub fn verify_lamport(index : Int, finalindex : Int, msghash : ByteArray, lampub : LamportPublicKey, signature : List<ByteArray>) -> Bool {
    when index == finalindex is {
        True -> True
        False -> {
            expect Some(pubel) = when test_bit(msghash, index) is {
                True -> list.at(lampub.pk_right, index)
                False -> list.at(lampub.pk_left, index)
            }
            expect Some(elementpreimage) = list.at(signature, index)
            when pubel == sha2_256(elementpreimage) is {
                True -> verify_lamport(index + 1, finalindex, msghash, lampub, signature)
                False -> False
            }
        }
    }
}
