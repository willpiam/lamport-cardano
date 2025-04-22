use cardano/transaction.{Transaction, OutputReference}
use aiken/crypto.{sha2_256}
use aiken/collection/list
use aiken/primitive/bytearray.{test_bit}

pub type LamportDatum {
  pk_left: List<ByteArray>,
  pk_right: List<ByteArray>,
  message: ByteArray
}


pub type LamportRedeemer {
  message: ByteArray,
  signature: List<ByteArray>
}

// if the bit at index in msghash is 1 return the element in the right list at index,
// otherwise return the element in the left list at index
fn getelement(index : Int, msghash : ByteArray, lampub : LamportDatum) -> Option<ByteArray> {
  if (test_bit(msghash, index)) {
    list.at(lampub.pk_right, index)
  }
  else {
    list.at(lampub.pk_left, index)
  }
}

fn verify_lamport(index : Int, finalindex : Int, msghash : ByteArray, lampub : LamportDatum, signature : List<ByteArray>) -> Bool {
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

validator lamport (_version: Int, strength: Int) {
  spend(datum: Option<LamportDatum>, redeemer: LamportRedeemer, _utxo: OutputReference, _self: Transaction) {
    expect Some( lampub ) = datum

    and {
      list.length(redeemer.signature) == strength,
      list.length(lampub.pk_left) == strength,
      list.length(lampub.pk_right) == strength,
      lampub.message == redeemer.message,
      verify_lamport(0, strength, sha2_256(redeemer.message), lampub, redeemer.signature)
    }
  }
}
