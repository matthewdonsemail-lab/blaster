/** Help text for `blaster numbers`, in its own module so a test can read it without running the CLI. */
export const NUMBERS_USAGE = `Usage: blaster numbers <action>

  search --country <code> --type <local|toll_free|mobile|national|shared_cost>
         [--features sms,voice] [--limit <n>] [--locality <city>]
         [--contains <digits>] [--startsWith <digits>] [--endsWith <digits>]
      Search Telnyx inventory for available numbers.
  buy --number <E.164> [--number <E.164>] [--profile <id>] [--reference <ref>] [--no-sync]
      [--state <US>] [--pool <id>]
      Purchase exact numbers on the default Telnyx account. Upserts into Twenty
      agencyPhones unless --no-sync, records them in Convex, and prints what each
      number still needs before it can send.
  attach --number <E.164> [--account <ref>] [--state <US>] [--profile <id>] [--pool <id>]
      Attach a number to its account, state, profile and pool. Use it for numbers
      bought under another account in that account's own Telnyx console.
  owned
      Numbers already owned on the Telnyx account.`;
