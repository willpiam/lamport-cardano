# An Approch to validating large lamport signatures over many transactions. 

## Introduction

Let eight non‑fungible tokens (NFTs), each linked to a distinct one‑eighth fragment of a public key, reside in eight separate UTxOs. To spend any given token, the user must supply the corresponding one‑eighth fragment of the signature; executing this step produces a successor UTxO that retains the NFT and carries a datum containing that fragment of the message hash.

In a final, ninth transaction, these eight UTxOs are consumed as inputs. Their datums are concatenated to reconstruct the complete message hash, at which point the protocol—now wielding the full cryptographic strength of the original key—confirms that the hash was indeed signed. If this reconstructed hash satisfies a predefined validation condition (for example, if its preimage accurately encodes the transaction’s inputs and outputs), the transaction is deemed valid and is committed to the chain.


```mermaid
flowchart LR
    %% Initial UTxOs with 4 NFTs and key fragments
    A1[UTxO A1: NFT1 + PKFrag1] -->|SigFrag1| T1[Tx1]
    T1 --> A2[UTxO A2: NFT1 + Datum1]

    B1[UTxO B1: NFT2 + PKFrag2] -->|SigFrag2| T2[Tx2]
    T2 --> B2[UTxO B2: NFT2 + Datum2]

    C1[UTxO C1: NFT3 + PKFrag3] -->|SigFrag3| T3[Tx3]
    T3 --> C2[UTxO C2: NFT3 + Datum3]

    D1[UTxO D1: NFT4 + PKFrag4] -->|SigFrag4| T4[Tx4]
    T4 --> D2[UTxO D2: NFT4 + Datum4]

    %% Aggregation transaction
    A2 -->|consume| T5[Tx5: Aggregate Datums]
    B2 -->|consume| T5
    C2 -->|consume| T5
    D2 -->|consume| T5
    T5 --> V[Verify full signature → Commit]

```

The final transaction may also burn the tokens.

## Initializing

Because the full public key is too large to distribute its eight constituent fragments into their corisponding UTxOs in a single transaction, we must deploy it in stages:

### Collective Minting

In the first transaction, mint all eight NFTs into a single UTxO guarded by a distribution validator. The datum of this UTxO records the Merkle root of the eight key fragments, with each leaf committing to one fragment of the public key. Note that the position in the merkle tree reflects the fragments position in the full public key. 



### Iterative Fragment Extraction
To deploy an individual key public key fragment, spend the relevant NFT from the distribution UTxO and lock it with the corisponding public key fragment in the datum. The validator enforces that the key chunck is the leaf at the expected position in the merkle tree. 

~~The validator checks the NFT against the stored Merkle root, then outputs a new UTxO locked by the fragment‑revealing script. This new UTxO’s datum must contain exactly the public‑key fragment corresponding to the NFT’s index.~~

### Final Configuration
Repeating the fragment‑extraction step for each of the eight NFTs yields eight distinct UTxOs, each holding one NFT and its matching key fragment in a datum. At this point, the user needs to know what to sign and we consider the system to be initalized. 


```mermaid
flowchart TD
    %% Initial state
    D1[Distribution UTxO: All 8 NFTs + Merkle Root] -->|Extract NFT1| T1[Tx1]
    T1 --> D2[Distribution UTxO: 7 NFTs + Merkle Root]
    T1 --> F1[Fragment UTxO: NFT1 + PKFrag1]

    D2 -->|Extract NFT2| T2[Tx2]
    T2 --> D3[Distribution UTxO: 6 NFTs + Merkle Root]
    T2 --> F2[Fragment UTxO: NFT2 + PKFrag2]

    D3 -->|Extract NFT3| T3[Tx3]
    T3 --> D4[Distribution UTxO: 5 NFTs + Merkle Root]
    T3 --> F3[Fragment UTxO: NFT3 + PKFrag3]

    D4 -->|Extract NFT4| T4[Tx4]
    T4 --> D5[Distribution UTxO: 4 NFTs + Merkle Root]
    T4 --> F4[Fragment UTxO: NFT4 + PKFrag4]

    D5 -->|Extract NFT5| T5[Tx5]
    T5 --> D6[Distribution UTxO: 3 NFTs + Merkle Root]
    T5 --> F5[Fragment UTxO: NFT5 + PKFrag5]

    D6 -->|Extract NFT6| T6[Tx6]
    T6 --> D7[Distribution UTxO: 2 NFTs + Merkle Root]
    T6 --> F6[Fragment UTxO: NFT6 + PKFrag6]

    D7 -->|Extract NFT7| T7[Tx7]
    T7 --> D8[Distribution UTxO: 1 NFT + Merkle Root]
    T7 --> F7[Fragment UTxO: NFT7 + PKFrag7]

    D8 -->|Extract NFT8| T8[Tx8]
    T8 --> F8[Fragment UTxO: NFT8 + PKFrag8]
```

