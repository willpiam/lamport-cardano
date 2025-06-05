A question about serialising Value. When I try to serialise the `Value` I intend to mint off-chain I get a subtlety different byte string than what I get when I do the same thing on-chain.  Why does this 

```typescript
const dummyTx = await lucid
  .newTx()
  .mintAssets({
    [simplePolicyId + fromText("MyToken")]: 1n,
  })
  .attach.MintingPolicy(simpleMintingPolicy)
  .complete();

const dummyTxObj : any = dummyTx.toJSON()
const mintObj = Object.keys(dummyTxObj.body.mint)
  .reduce((acc, key) => {
      acc.set(key, new Map(Object.entries(dummyTxObj.body.mint[key]).map(([k, v] : [string, any]) => [k, BigInt(v)])))
      return acc
  }, new Map<string, Map<string, bigint>>())

const ValueSchema = Data.Map(
  Data.Bytes(), 
  Data.Map(
    Data.Bytes(), 
    Data.Integer()
  )
)
type Value = Data.Static<typeof ValueSchema>;
const Value = ValueSchema as unknown as Value;

const preimage = Data.to<Value>(mintObj, Value)
```

not match this

```rust
let mint_bytes = builtin.serialise_data(self.mint)
```

My off-chain code the value is stored in `preimage` and is equal to 

`bf581cd441227553a0f1a965fee7d60a0f724b368dd1bddbc208730fccebcfbf474d79546f6b656e01ffff`

My on chain code is of course stored in mint_bytes and is equal to 

`A1581CD441227553A0F1A965FEE7D60A0F724B368DD1BDDBC208730FCCEBCFA1474D79546F6B656E01`

as you can see much of these two values is the same. Its only the beginnings and ends which differ. 

Thanks!