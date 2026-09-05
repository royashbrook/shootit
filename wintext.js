// the win sheet's one line of detail. pure, so node can check the wording.
// par is the generator's own greedy bot on the same layout (levels.js
// findLevel returns it), so every run ships with the number it was proven at.
export function winDetail({ count, par, best }) {
  let made = `${count} buddies made it!`
  if (best != null) {
    made = count > best ? `${count} buddies made it, your best yet!` : `${count} buddies made it. your best is ${best}.`
  }
  const vsPar = count > par ? `you beat par ${par}!` : count === par ? `right on par ${par}.` : `par is ${par}.`
  return `${made} ${vsPar}`
}
