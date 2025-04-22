// create 7 accounts ... save seed and address to a json file called test-accounts.json

import { Emulator, generateSeedPhrase, Lucid } from "npm:@lucid-evolution/lucid";


async function init_get_wallet_address(): Promise<[string, string]> {
    const emulator = new Emulator([]);
    const offlineLucid = await Lucid(emulator, "Preview");
    const seedPhrase = generateSeedPhrase();
    offlineLucid.selectWallet.fromSeed(seedPhrase);
    const address = await offlineLucid.wallet().address();
    return [address, seedPhrase];
}


const testAccounts = await Promise.all(Array.from({ length: 7 }, () => init_get_wallet_address()));

console.log(testAccounts);

// save to file
Deno.writeTextFileSync("test-accounts.json", JSON.stringify(testAccounts, null, 2));

