use aiken/primitive/bytearray
use aiken/collection/list
use aiken/crypto.{sha2_256}

pub type ProofNode {
  hash: ByteArray,
  sibling_on_left: Bool,
}

fn recursive_verify_merkle_proof(current: ByteArray, nodes: List<ProofNode>) -> ByteArray {
  when list.is_empty(nodes) is {
    True -> current
    False -> {
      expect Some(head) = list.head(nodes)
      let ProofNode { hash: sibling, sibling_on_left } = head

      let parent = if sibling_on_left {
        sha2_256(bytearray.concat(sibling, current))
      } else {
        sha2_256(bytearray.concat(current, sibling))
      }

      expect Some(rest) = list.tail(nodes)
      recursive_verify_merkle_proof(parent, rest)
    }
  }
}

pub fn verify_merkle_proof(root: ByteArray, proof: List<ProofNode>, leaf_hash: ByteArray) -> Bool {
  let derived_root = recursive_verify_merkle_proof(leaf_hash, proof)
  root == derived_root
}