// Questions customers really ask, in the three ways they write them, and the
// kind of document that should answer each. Used by `npm run kb:eval` against
// the demo shop's knowledge. Add cases here when a real question fails.

export type Lang = "bangla" | "banglish" | "english";
export type EvalCase = { query: string; expect: string; lang: Lang };

export const EVAL_CASES: EvalCase[] = [
  // delivery
  { query: "ঢাকার বাইরে ডেলিভারি চার্জ কত?", expect: "delivery", lang: "bangla" },
  { query: "কতদিনে product পাবো?", expect: "delivery", lang: "bangla" },
  { query: "delivery charge koto?", expect: "delivery", lang: "banglish" },
  { query: "kotodin e pabo product ta", expect: "delivery", lang: "banglish" },
  { query: "free delivery ache?", expect: "delivery", lang: "banglish" },
  { query: "how long does delivery take", expect: "delivery", lang: "english" },
  { query: "which courier do you use", expect: "delivery", lang: "english" },

  // payment
  { query: "বিকাশে টাকা পাঠাবো কিভাবে?", expect: "payment", lang: "bangla" },
  { query: "ক্যাশ অন ডেলিভারি আছে?", expect: "payment", lang: "bangla" },
  { query: "bkash e payment kora jabe?", expect: "payment", lang: "banglish" },
  { query: "cod ache?", expect: "payment", lang: "banglish" },
  { query: "nagad number ta den", expect: "payment", lang: "banglish" },
  { query: "how can I pay", expect: "payment", lang: "english" },

  // return and exchange
  { query: "রিফান্ড কতদিনে পাবো?", expect: "policy", lang: "bangla" },
  { query: "পণ্য ফেরত দেওয়া যাবে?", expect: "policy", lang: "bangla" },
  { query: "return kora jabe?", expect: "policy", lang: "banglish" },
  { query: "ami exchange korte chai", expect: "policy", lang: "banglish" },
  { query: "product e problem ache ferot dibo", expect: "policy", lang: "banglish" },
  { query: "can I return it if it does not fit", expect: "policy", lang: "english" },

  // size guide
  { query: "L size এর বুকের মাপ কত?", expect: "faq", lang: "bangla" },
  { query: "আমার বুকের মাপ ৪১, কোন সাইজ নিবো?", expect: "faq", lang: "bangla" },
  { query: "size guide den", expect: "faq", lang: "banglish" },
  { query: "buker map 40 hole kon size lagbe", expect: "faq", lang: "banglish" },
  { query: "what size should I get", expect: "faq", lang: "english" },

  // opening hours and contact
  { query: "দোকান কয়টা পর্যন্ত খোলা?", expect: "about", lang: "bangla" },
  { query: "apnara kokhon khola thake?", expect: "about", lang: "banglish" },
  { query: "friday te open ache?", expect: "about", lang: "banglish" },
  { query: "hotline number ta den", expect: "about", lang: "banglish" },
  { query: "what time do you close", expect: "about", lang: "english" },
];
