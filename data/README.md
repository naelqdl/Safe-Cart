# SafeCart seed data

Selected CPSC recalls (RecallIDs): 10014 (Besrey Twins Strollers, model BR-C708S) and 10328 (Peg Perego Tatamia high chair, model IMTATANA01BL73).

- recalls/10014.raw.json, recalls/10328.raw.json: verbatim records from https://www.saferproducts.gov/RestWebServices/Recall (CPSC)
- recalls/10014.json, recalls/10328.json: normalized from the raw CPSC records; models taken from the CPSC Description text (Products[].Model is empty)
- catalog.json: simulated
- user.json: simulated
- wishlist.json: simulated
- owned.json: simulated
- inbox/*.eml: simulated order confirmation emails
- kb/store-policy.txt: simulated
- kb/preferences.txt: simulated
