const WAITLIST_TIERS = Object.freeze({
  priority_10000: {
    id: "priority_10000",
    label: "Priority access: first 10,000 units",
    amountCents: 10000,
    accessType: "paid-priority",
    limit: 10000,
    cumulativeSelectionIds: ["priority_10000"],
    stripeProductName: "VFORCE Priority Reservation: First 10,000 Units",
    stripeDescription: "Priority reservation fee credited toward your final VFORCE purchase."
  },
  priority_100000: {
    id: "priority_100000",
    label: "Priority access: first 100,000 units",
    amountCents: 7500,
    accessType: "paid-priority",
    limit: 100000,
    cumulativeSelectionIds: ["priority_10000", "priority_100000"],
    stripeProductName: "VFORCE Priority Reservation: First 100,000 Units",
    stripeDescription: "Priority reservation fee credited toward your final VFORCE purchase."
  },
  priority_1000000: {
    id: "priority_1000000",
    label: "Priority access: first 1,000,000 units",
    amountCents: 5000,
    accessType: "paid-priority",
    limit: 1000000,
    cumulativeSelectionIds: ["priority_10000", "priority_100000", "priority_1000000"],
    stripeProductName: "VFORCE Priority Reservation: First 1,000,000 Units",
    stripeDescription: "Priority reservation fee credited toward your final VFORCE purchase."
  },
  free: {
    id: "free",
    label: "Free waitlist",
    amountCents: 0,
    accessType: "free",
    limit: null,
    cumulativeSelectionIds: [],
    stripeProductName: "",
    stripeDescription: ""
  }
});

function getWaitlistTier(id) {
  return WAITLIST_TIERS[id] || null;
}

function getPaidTierIds() {
  return ["priority_10000", "priority_100000", "priority_1000000"];
}

module.exports = {
  getWaitlistTier,
  getPaidTierIds,
  WAITLIST_TIERS
};
