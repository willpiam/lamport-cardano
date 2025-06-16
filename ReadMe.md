# Lamport Proof Of Concept

## The Problem 

It is desirable to support Lamport signatures on Cardano as a minimal quantum secure account solution. 

The Cardano blockchain has a tight restiriction on the transaction size and number of computational steps taken per transaction which makes it infeasable to verify a lamport signature. [1] 

There is an additional issue which is that the lampoert signature itself counts toward the transaction hash because it cannot be stored in the witness set and is instead placed inside the redeemer. I refer to this as *the circular-hash-dependency problem*. 

The first two parts of this proof-of-concept circumvent the transaction size limit in different ways. The first part simply truncates the lamport key sizes to a value that will fit. This has the obvious disadvantage of reduced security. The second part verifies a signature over many transactions. This enables 256 bit security but sacrafices usability and incurs greater transaction fees. The final part of this proof-of-concept addresses *the circular-hash-dependency problem*. This is acomplished by building and signing a custom representation of the transaction.  

1. As of __date__ the transaction size limit is __ and the maximum number of steps is __. 

## Part 1 - Partial Verification or Truncated Signatures

In this Proof-Of-Concept an NFT is minted and locked in a validator with a Lamport public key and an expected message in the datum. In order to unlock the NFT a Lamport signature must be provided via the redeemer. That signature must match with the expected message and public key. 

This demonstraties how to execute the lamport algorithum for signature verification in a smart contract. To address the transaction size limitation the public key and signature are truncated to a prespecified strength. This PoC does nothing to address *the circular-hash-dependency problem*

### Primary Files

#### On-Chain

`/lamport-validator/validators/lamport.ak`

#### Off-Chain

`index.ts`

### Available Tasks

- `deno task dev` - Run the project in watch mode
- `deno task run` - Run the project
- `deno task run:emulator` - Run the project entierly locally by using an emulator
- `deno task run:preview` - Run the project on the preview testnet
- `deno task persistenceTest` - Run the persistence experiment
- `deno task lamportExperiment` - Run the off-chain experiment


### First Demo (Partial Strength Veification)

With strength set to 63

- [Mint](https://preview.cardanoscan.io/transaction/8122fbe51d5826ee3a48147ff628cdd01be6923d5f4b3584f3f5a45a595177b0)
- [Lock](https://preview.cardanoscan.io/transaction/3857202173e57f1e4a17f79aae7a441d11638ad4e4d9f0fd303b685c80ce6766)
- [Unlock](https://preview.cardanoscan.io/transaction/eb5f4c1350987fc15d9fad530c659fee952f5d67dd6664796684ef96773bc84b)
- [Burn](https://preview.cardanoscan.io/transaction/a3da7cab90612c546fd36687237354fa83946d989ccb402f4c7c697d6d3bfccb)

The actual verification of the Lamport signature happens during the *unlock* step.

## Part 2 - Full Verification Over Many Transactions

In this phase of the proof-of-concept we construct a scheme which uses eight *ephemeral NFTs* to initially represent a piece of a public key and later to represent a piece of a message hash signed with that public key. This scheme allows us to verify one eigth of a signed message at a time and later to combine these parts to verify a a full 256 bit lamport signature.   


### Steps

#### Minting the tokens

The eight nfts are minted into the same utxo. Their names are "1", "2", through "8". They are locked with a 
datum which contains a 256 bit merkle root and an integer of value 8. 

#### Initializeing The Public Key Chunks

In order of their names we one at a time "initialize" a token by moving it into its own utxo and locking it with a datum containing an integer representing the position of the key chunk, and the public key chunk itself. After each token is initialized with a public key we move the rest into a similar datum to what they were in previously but with the integer value in its datum decremented by one. 

#### Verifying Each Signature Chunk

Off-chain the user decides what message they want to sign. They take its 256 bit hash and break it into eight 
pieces while being careful to remeber their original order. They then sign each piece with the corisponding part of their lamport key. 

On-chain the resulting signature chunk is provided via the redeemer and the token is transfered to a utxo locked with a datum holding the position of the message chunk as well as a 32 bit chunk storing one eigth of the message hash. 

#### Verifying The Full Signature

Finally all eight tokens are gathered in a final transaction. The unhashed message is submitted via the redeemer. The message hash chunks are concatinated together and then compaired against the hash of the message in the redeemer. These two 256 bit values must be identical. In this final transaction all eight of the tokens must be burnt. 

### Transaction Count

    1 to mint
    8 to init
    8 to verify signature
    1 to check message and burn

    18 transactions total

### Primary files

**On-chain**

`/lamport-validator/validators/manystep.ak`

A validator to handle the lifetime of the multi-step lamport signature scheme. 

`/lamport-validator/lib/verify_lamport.ts`

A module for the lamport logic and any related types

`/lamport-validator/lib/merkle.ak`

A module for merkle proof verification

**off-chain**

`manystep_test.ts`

A series of unit tests to simulate the use of the multi-step lamport authentication scheme. 

`MerkleTree.ts`

Definition of MerkleTree class which encapsulates the logic for generating and checking merkle proofs.

`MultiStepLamport.ts`

A class derived from the Lamport class (defined in Lamport.ts) with added functions to support the chunk and merkle tree systems.



-----


**Note to self... we should probably be able to get ride of all these "position" values in the datums/redeemers and only use the number found in the tokens name. Or we could consider using the token name to serve some other role**


### Another thing.. this is how I've been running my recent tests

    deno test --allow-read --fail-fast --filter "Custom Transaction Id"

### quick insight into number of tokens deciopn

it may be very smart to try to reduce the number of "steps" as this would allow you to do this in less transaction. So what is the optimal number of chunks to split the system into? Well for every chunk removed you save 2 transactions (initializing the token with the public key + verifying part of a signature against that public key). Its important to note that this implementation always expects the checking of the full signature in a seperate step. This means that in that last transaction you don't have the overhead of actually checking a lamoprt key. Its probably worth trying to reduce the number of chunks to just enough that transactions always suceed.

## Questions

### Making an account

*The Transaction Malleability Problem*

How can we prevent replay attacks in a Lamport signature scheme where the message being signed needs to uniquely identify the transaction, but the signature itself (stored in the redeemer) affects the transaction hash?

In other words if I sign to spend from my Lamport validator but never submit the transaction on-chain and instead give you the signature, how can I be sure that the only thing you can do with it is use it to spend my utxo exactly as I intended to spend it. 


### Verification Over Many Transactions

Is there some way in which I can verify a lamport signature over multiple transactions?

*see `docs/validation_over_multiple_steps.md` for an outline of an approch to this problem*


## dotenv

```ini
BLOCKFROST_API_KEY=""
SEED_PHRASE=""
NETWORK="Preview"
```

## To Do (short terms items to return to)

- [ ] make `lamport.ak` use `lib/verify_lamport.ak`
- [ ] write a through series of tests for `Lamport.ts`
- [x] add tests for "things that should fail" to `manystep_test.ts`
- [ ] Make **sure** merkle tree implementation is rock solid 



## Related Work

| Title                               | Reference                             |
| ----------------------------------- | ------------------------------------- | 
| LAMB Whitepaper                     | https://anchorwallet.ca/whitepaper/   |
| Anchor Vault (EVM) Chrome Plugin    | https://chromewebstore.google.com/detail/anchor-vault/omifklijimcjhfiojhodcnfihkljeali |
| LAMB Account Factory On Ethereum    | https://etherscan.io/address/0xBbec2f0bd58EA433BB38ac8ed699DED914087D6f#code           |



