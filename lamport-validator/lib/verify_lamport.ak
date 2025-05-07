use aiken/crypto.{sha2_256}
use aiken/collection/list
use aiken/primitive/bytearray.{test_bit}

pub type LamportPublicKey {
  pk_left: List<ByteArray>,
  pk_right: List<ByteArray>
}

fn getelement(index : Int, msghash : ByteArray, lampub : LamportPublicKey) -> Option<ByteArray> {
  if (test_bit(msghash, index)) {
    list.at(lampub.pk_right, index)
  }
  else {
    list.at(lampub.pk_left, index)
  }
}

pub fn verify_lamport(index : Int, finalindex : Int, msghash : ByteArray, lampub : LamportPublicKey, signature : List<ByteArray>) -> Bool {
  if (index == finalindex) {
    True
  }
  else {
    expect Some(pubel) = getelement(index, msghash, lampub)
    expect Some(elementpreimage) = list.at(signature, index)
    if (pubel == sha2_256(elementpreimage)) {
      verify_lamport(index + 1, finalindex, msghash, lampub, signature)
    }
    else {
      False
    }
  }
}