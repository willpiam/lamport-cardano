
# Securing the intent of a signature without the ability to directly sign a transaction/tx hash


Because the redeemer holds the Lamport signature and the redeemer contributes to the hash of the transaction
we cannot simply sign the hash of the transaction. So how can we validate that a transaction with a ligitimate signature 
actually endorses the current transaction? 

My current thinking is to have some kind of description of what the transaction is "supposed" to do. 