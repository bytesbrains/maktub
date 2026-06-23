# Safety Triggers

A guide to using Maktub as a silence-triggered safeguard for solo activities: hiking, backcountry travel, remote field work, long drives in isolated areas, and anywhere else that being alone has real consequences. It delivers a sealed message to the people you choose if you go quiet.

This guide is for:

- Solo hikers, backpackers, climbers, and paddlers
- Field researchers, wildlife workers, and remote inspectors
- Long-haul drivers and delivery riders
- People in professions where a quiet disappearance is a plausible risk
- Anyone who has ever hesitated to tell a friend "if you don't hear from me by tonight, call for help"

> **Maktub is not a replacement for a personal locator beacon or satellite SOS device.** If you can afford one, carry one. Maktub is a lower-cost, lower-infrastructure complement — it works from any smartphone with an internet connection, does not require a subscription, and costs a small one-time fee to activate. It is also not a real-time emergency system; there is typically a 2–10 second delay between timer expiry and execution, and there is always some amount of delay between execution and a human being seeing the delivered message.

---

## Table of contents

1. [The primitive for safety](#the-primitive-for-safety)
2. [The 127 Hours case](#the-127-hours-case)
3. [What to put in a safety-trigger payload](#what-to-put-in-a-safety-trigger-payload)
4. [Picking an interval](#picking-an-interval)
5. [Who should receive it](#who-should-receive-it)
6. [Before you leave](#before-you-leave)
7. [While you are out](#while-you-are-out)
8. [When you return](#when-you-return)
9. [Failure modes](#failure-modes)
10. [How this compares to other tools](#how-this-compares-to-other-tools)

---

## The primitive for safety

A safety-trigger heartbeat is a short-interval heartbeat (typically 1 to 24 hours) whose payload contains the information a rescuer would need to find you quickly. You check in at meaningful points during your trip. If you do not check in, your emergency contacts get your plan, your last known position, and an instruction to start searching.

The mental model is simple: **you are telling the protocol "if I go quiet, tell these people where to start looking."**

Unlike a subscription PLB or a satellite messenger, Maktub:

- Works on any smartphone that has internet access at the moment you check in
- Does not require a device you might forget to carry
- Costs a small one-time fee, regardless of how long the trip lasts
- Delivers a full message, not just a coordinate

## The 127 Hours case

Aron Ralston, in 2003, was trapped under a boulder in Blue John Canyon for five days before he freed himself by amputating his own arm. He had not told anyone where he was going. No one knew to look. He survived because he was physically and mentally exceptional; most people in that situation would not.

A safety heartbeat would not have freed him from the boulder. But if he had set an 8-hour timer and checked in at the trailhead, his emergency contacts would have known where to send searchers within hours, not days.

Many real-world cases are quieter and sadder than Ralston's. People who fall on ordinary trails, have a stroke on a quiet road, or simply become hypothermic because they got wet. In most of these cases, the outcome hinges on how quickly the right people are alerted.

Maktub shortens that interval dramatically, for a cost smaller than the parking fee at most trailheads.

## What to put in a safety-trigger payload

A good safety-trigger payload is short, scannable, and written in a tone a stressed friend or family member can process quickly.

A template:

```
SAFETY TRIGGER — [YOUR NAME]
Timer set at: [date and time, with time zone]
If you are reading this, I have not checked in and something may be wrong.

WHAT TO DO RIGHT NOW
1. Try to call me: [phone number]
2. If no answer within 15 minutes, call [local ranger / police / SAR authority]
   and tell them I am overdue from a trip.

WHERE I AM
- Trailhead / start: [GPS coordinates + parking area description]
- Planned route: [route name or description]
- Vehicle: [make, model, color, license plate, location]
- Expected return: [date, time, time zone]

WHAT I AM DOING
[One paragraph. "Solo day hike on the Blue Lake loop, roughly 12 miles with
2,400 feet of elevation. Expected time 6-8 hours. Carrying rain gear,
headlamp, 2L water, sandwich, first-aid kit."]

WHO TO CONTACT
- Trip partner / home base: [name + phone]
- Parent or spouse: [name + phone]
- Employer (if relevant): [name + phone]

IMPORTANT CONTEXT
[Medical conditions, medications, allergies. Communication quirks — "I often
run out of cell signal for hours; do not panic until [specific threshold]."]

AUTHORITIES BY REGION
[If you travel often, pre-populate the search-and-rescue or ranger number
for the region. Do not expect a recipient in another city to find it fast.]
```

Keep it under one screen. The first three lines are what your recipient will read; the rest supports whatever they do next.

**Do not include sensitive credentials in a safety-trigger payload.** If you want seed phrases delivered if you die on a trip, create a separate long-interval digital estate heartbeat. A safety-trigger payload is a search-and-rescue briefing; it should be safe to show a stranger in an emergency.

## Picking an interval

The interval is the maximum gap between check-ins. Choose based on the rhythm of your activity.

**1 hour.** The shortest interval the protocol allows. For active, high-consequence situations: solo climbing a pitch, navigating a dangerous section, descending a canyon. You must check in from the field, typically from your phone while it still has signal. Best used for short windows, not whole days.

**2 to 4 hours.** Common for technical day hikes and scrambles where check-ins are feasible at natural break points (the summit, a junction, a viewpoint).

**6 to 8 hours.** The "one check-in mid-trip" model. Common for full-day backpacking, long trail runs, or day-long paddles.

**12 hours.** Overnight. Check in at camp in the evening and at breakfast. Good for multi-day trips where you expect one connected camp per night.

**24 hours.** Daily check-in. The standard for multi-day expeditions, long road trips, and field deployments where you expect to be in contact once a day. Also the most common interval for professional field work.

Longer intervals defeat the point of a safety trigger.

Rule of thumb: **pick the longest interval that matches your worst-case reporting cycle.** Too short, and you will miss a check-in because you couldn't find signal, and your contacts will worry unnecessarily. Too long, and the alert comes too late to matter.

## Who should receive it

For a safety trigger, the recipient is not a legal heir — it is whoever is going to act on the information.

Ideal recipients:

- A spouse, partner, housemate, or close family member who is at home
- A designated "home base" friend for a group trip
- A colleague at your organization if you are doing professional field work

**One recipient is usually enough.** Multiple recipients can create confusion — who is in charge, who calls, who follows up. If you want redundancy, name a primary recipient plus one backup, and be explicit in the payload about who does what.

**Your recipients must be registered** in the Recipient Registry before the heartbeat can name them. This is a one-time, 2-minute setup. Do it once with each of your safety contacts; then you can name them on many trips without any extra setup.

**Test your recipient.** Send a real delivery with a harmless payload: set a 1-hour heartbeat, don't check in, let it expire, and confirm that your recipient receives it and knows how to open it. Do this before your first real trip. You will find any onboarding gaps in a low-stakes context instead of discovering them after you've actually gone missing.

## Before you leave

A pre-trip routine takes about 5 minutes.

1. **Confirm your payload is current.** Open the app and check the payload preview. Did you update your route? Your partner? Your vehicle plate? Update and save. Updating recipients or interval resets the timer, so you start fresh.
2. **Choose your interval for this trip.** You can reuse a template heartbeat if you always use the same recipient and similar payload.
3. **Check your phone battery and charger.** You will need your phone to check in. Carry a battery pack for multi-day trips.
4. **Test a check-in from where you are.** A successful check-in means the transaction made it to the chain. If you can't connect, find a spot that can and try again.
5. **Tell your recipient you are starting a trip.** A quick "starting Blue Lake hike now, 8-hour timer, see you tonight" via text makes the later alert less jarring if it fires.

On the road or at the trailhead, check in once before you leave signal. That sets a clean baseline.

## While you are out

Check in at meaningful milestones. A good pattern:

- At the trailhead before you start
- At the turnaround point or summit
- When you reach the vehicle on return
- Whenever you regain signal after a long gap

You do not have to wait until the timer is about to expire. A check-in is free; do it whenever you have signal. Frequent early check-ins give you more margin on long stretches without signal.

If you cannot get signal, do not panic — many regions have intermittent coverage. Plan your route so that signal is available at enough choke points to keep the timer fresh. If you know you will be off-grid for 10 hours, do not set a 6-hour timer.

If the timer is about to expire and you are safe but can't connect, the simplest option is to return toward signal. If this is not possible, the alert will fire. Your recipient will call your phone first; if you come back into signal within minutes, you can call them before any rescue mobilizes. This is mostly embarrassing, not dangerous.

## When you return

When you are back and safe:

- **Check in one final time.** This is the "I'm back" signal.
- **Do not deactivate the heartbeat.** Deactivation is permanent. You will want to reuse the heartbeat on your next trip by updating the payload.
- **Optional: let the heartbeat expire intentionally** after you've finished using it if you want to close the loop. Choose a short interval specifically for this trip, and after you return, let it expire (sending a "trip completed safely" message to your recipient). This is a stylistic choice — some people like it, some find it unnecessary.

## Failure modes

**You lose phone signal for longer than your interval.** The heartbeat expires; your recipient gets the payload. They will call your phone first. If you come back in range quickly, no harm done. If not, search and rescue is activated according to the instructions in your payload. Net effect: an early-false-alarm SAR response instead of no response at all.

**Your phone dies.** Same as above. The fix is a battery pack.

**Your recipient is not near their phone when the alert fires.** This is why the payload should include multiple phone numbers. Your recipient should understand that this is a time-sensitive alert.

**Base L2 is unavailable at the moment you try to check in.** On the rare event of a Base sequencer outage, your check-in transaction queues on the L1 fallback. There may be a delay of minutes to hours, which could cause a timer expiry if your interval is short. In practice Base has been highly reliable; for extremely time-critical use cases, consider a 2-hour or 4-hour interval instead of 1-hour to give the chain slack.

**You create a heartbeat and then can't afford the check-in gas.** Check-in costs are a negligible amount of network gas. A small funding lasts through hundreds of check-ins. If you somehow run out, the app will warn you well before the timer expires.

**You deliberately want the heartbeat to not fire** after a trip (perhaps you forgot to deactivate before going off-grid for a month). Call `deactivate` before the timer expires. Deactivation is permanent — you cannot reactivate the same heartbeat.

## How this compares to other tools

**Personal locator beacon (PLB) or satellite messenger** (Garmin inReach, ACR ResQLink, Zoleo, SPOT). These are the gold standard for wilderness safety because they work without cell signal. If you do serious backcountry, carry one. Maktub complements but does not replace them. Common hybrid: a PLB for the "I'm hurt, come get me" case and a Maktub heartbeat for the "no one has heard from me" case.

**Trip plan with a friend.** The traditional approach. Tell someone your plan and when to worry. Maktub codifies this and makes it automatic. You do not need your friend to remember to check on you; the protocol does it.

**AllTrails / Strava "live tracking."** Broadcasts your location to selected friends. Good for routine trips with good coverage. Fails when you lose signal for long stretches because there is no alert, only silence. Maktub turns that silence into an alert.

**911 or regional emergency services.** These are the only real-time emergency services. Use them when you are in immediate danger and can reach them. Maktub cannot replace them — it is an alerting system, not a response system.

**Checking in manually with texts.** Works until it doesn't. Human schedulers forget, sleep through, or dismiss a late text. Protocol does not.

The honest positioning: Maktub is the cheapest way to add "automatic alert if I go quiet" to any trip, from any smartphone, with no subscription and no extra device. It does not replace any of the above; it fills a specific gap that most of them do not fill on their own.

---

## Related reading

- [Getting Started](./getting-started.md)
- [Safety Guide](./safety-guide.md) — what to do about lost wallets, failed check-ins, and network outages
- [Press Freedom](./press-freedom.md) — a different short-interval use case
- [How It Works](./how-it-works.md)
- [FAQ](./faq.md)

