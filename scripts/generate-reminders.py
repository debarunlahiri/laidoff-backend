"""Builds migrations/008_more_daily_reminders.sql (about 1,000 daily reminders).
Run: python3 scripts/generate-reminders.py   (the generated SQL is committed)."""
import random, itertools, re, os

R = random.Random(2026)
quotes = []  # (theme, quote)

def add(theme, q):
    q = q.strip()
    quotes.append((theme, q))

# ---- T1: you are more than ... ------------------------------------------
more_than = [
 "your last job title","a rejection email","a gap on your résumé","one hard interview","your notice period",
 "a restructuring memo","a performance review","the day you were laid off","your current salary","a ghosted application",
 "the number of applications you’ve sent","a LinkedIn headline","an unanswered message","a layoff announcement","a quarter of missed targets",
 "the company you worked for","the badge you handed back","a stalled search","a bad manager","one wrong turn",
 "the offer that fell through","a ‘we’ve decided to move on’ email","how fast you find your next role","a polished profile","your busiest year",
 "someone else’s timeline","what the market says today","a single bad week","the story you told yourself last night","a notification sound",
 "your résumé’s length","a title that no longer exists","a team that no longer exists","this season","a closed door",
 "the questions you couldn’t answer","your lowest point","a plan that changed","the last thing that went wrong","an algorithm’s decision",
]
for x in more_than:
    add("worth", f"You are more than {x}.")

# ---- T2: feeling + permission ---------------------------------------------
feelings = ["Anger","Fear","Relief","Grief","Confusion","Embarrassment","Numbness","Hope","Doubt","Exhaustion","Envy","Excitement"]
perms = ["Resting is allowed too.","So is asking for help.","So is a slow morning.","So is taking one small step.","So is celebrating a tiny win.","So is telling a friend.","So is saying no to something today.","So is a long walk.","So is starting again tomorrow.","So is changing your mind.","So is not having a plan yet.","So is being proud of how far you’ve come."]
for f in feelings:
    for p in R.sample(perms, 10):
        add("feelings", f"{f} is allowed. {p}")

# ---- T3: tiny actions ---------------------------------------------------
tiny = [
 "send one message to someone you used to work with","update one line of your résumé","save one job you’re genuinely curious about","reply to the recruiter you’ve been avoiding",
 "write down three things you’re good at","drink some water and step outside","thank someone who helped you","ask one person for a coffee chat","read one job description all the way through",
 "tidy your LinkedIn summary","organise your portfolio links","delete one tab you’ve been carrying around","ask a friend to proofread your cover letter","book one small thing to look forward to",
 "practise one interview answer out loud","follow up on an application from last week","write down one question you want to ask an employer","comment on a post from someone in your field",
 "message one person who got laid off recently","ask for feedback after an interview","list the projects you’re proudest of","look up one company you admire","stretch for five minutes",
 "set a realistic goal for the week","put your phone away for an hour","sleep a little earlier tonight","cook something that makes you feel looked after","tell someone how you’re really doing",
 "refresh your skills with a 20-minute lesson","back up your work samples","check in on someone else in the circle","walk without a destination","write the headline of your story in one sentence",
 "add one achievement with a number to your résumé","say no to something that drains you","take a real lunch break","ask a mentor one honest question","write a thank-you note you’ve been postponing",
 "clear one corner of your desk","write down what you want your next role to feel like","name one thing that went well this week","unfollow one account that makes you feel behind","try one new keyword in your search",
 "contact a former manager for a reference","skim one industry newsletter","ask your network who’s hiring","apply to one role you only half-qualify for","save your best work as a PDF",
 "give yourself credit for getting through today","leave one review of a course that helped you","reconnect with a classmate","draft your elevator pitch","plan tomorrow’s first task tonight",
 "do one thing that’s just for fun","write down what you’d tell a friend in your position","listen to a talk by someone you admire","ask your community for an introduction","check your budget calmly, once, and close the tab",
 "update your availability on your profile","take a photo you’d be happy to use for your profile","practise saying your salary range out loud","write a list of companies you’d love to learn from","ask someone how they got their first break",
]
frames = ["Today, {a}. That counts.","Small win for today: {a}.","If you do only one thing today, {a}.","You don’t need a big plan. Just {a}.","Tonight’s goal: {a}."]
for i,a in enumerate(tiny):
    for fr in R.sample(frames, 3):
        add("tiny", fr.format(a=a))

# ---- T4: rejection reframes ----------------------------------------------
rej = ["A rejection","A silent recruiter","A closed role","A ‘no’ after four rounds","A slow reply","A role that went to someone internal","A hiring freeze","A cancelled interview","An automated rejection","A salary gap"]
says = ["says more about timing than about your talent.","is information, not a verdict.","is one data point, not your whole story.","doesn’t erase what you bring.","is rarely about the only thing you can see.","can be a redirect you haven’t understood yet.","hurts because you cared — that’s a strength.","is a chance to sharpen, not to shrink.","is a reason to ask for feedback, not to give up.","is not a measure of your future."]
for r in rej:
    for s in R.sample(says, 8):
        add("rejection", f"{r} {s}")

# ---- T5: skills that stay ------------------------------------------------
skills = ["problem-solving","leadership","empathy","communication","curiosity","attention to detail","negotiation","mentoring","teamwork","creativity","resilience","project ownership","clear writing","calm under pressure","learning quickly","data thinking","customer care","planning","design sense","coding","analysis","teaching","storytelling","initiative","reliability"]
sk_frames = ["Your {s} didn’t leave with your access badge.","Your {s} is still yours, wherever you work next.","Nobody can lay off your {s}.","Your {s} is worth more than any single employer’s valuation.","The next team will be lucky to get your {s}."]
for s in skills:
    for fr in R.sample(sk_frames, 4):
        add("skills", fr.format(s=s))

# ---- T6: community -------------------------------------------------------
who = ["Someone in this circle","Another member","A person you’ve never met","A recruiter reading these posts","A reader of this feed","A neighbour in this community","Someone who joined last week","A member from your industry","A person who was laid off last year","A quiet reader"]
did = ["has already walked the road you’re on — ask them how.","is hoping someone will message them first. Be that person.","will say yes to a short coffee chat.","needs to hear what you learned this week.","can introduce you to the right person.","remembers how it felt to be new here.","will be glad you shared your story.","is rooting for you more than you know.","found their next role through a conversation, not an application.","would love to hear one thing that helped you."]
for w in who:
    for d in R.sample(did, 8):
        add("community", f"{w} {d}")

# ---- T7: hand-written aphorisms -----------------------------------------
hand = """The gap on your résumé is a gap in the calendar, not in your ability.
You don’t have to be fearless. You just have to keep moving gently forward.
Hope is a habit you can practise in tiny doses.
Your story is still being written — and you hold the pen.
Slow progress is still progress.
Asking for an introduction is not a burden; it’s how most good jobs are found.
You are allowed to want more than just any job.
Not every door is meant for you, but the right one will not stay closed forever.
Rest is not quitting. It’s refuelling.
Today’s uncertainty is tomorrow’s plot twist.
Your network is bigger than you think, and kinder than you fear.
You can grieve a job and still be excited about what’s next.
Confidence returns the moment you start doing, not the moment you feel ready.
Every professional you admire has an unflattering chapter they don’t post about.
A layoff is a business decision. Your value is not.
Some seasons are for building; some are for rebuilding. Both are work.
You can be a beginner at 40 and still bring 20 years with you.
A career is a long road with many on-ramps.
The best time to reach out was last week. The second best is right now.
Be as patient with yourself as you would be with a friend.
You don’t owe anyone a perfect comeback story.
Tell the truth about how it’s going. Someone needs to hear it.
Your pace is not a problem to be solved.
Clarity often comes after action, not before.
Don’t compare your chapter one to someone else’s chapter twenty.
You’ve survived every hard day so far. That’s a very good track record.
Even a ‘no’ means you were brave enough to ask.
The right team will see what the wrong team missed.
Sometimes the bravest thing is to sit down and begin the application.
Uncertainty is uncomfortable, not dangerous.
Your experience is a foundation, not a footnote.
Think of this as a pivot, not a pause.
The next role may look different from the last — and that can be a good thing.
You’re allowed to take pride in what you built, even if it was cut short.
Keep your standards high and your expectations kind.
Treat your job search like a project with breaks, not a battle without end.
Taking care of your health is also part of finding the next job.
Your future colleagues are waiting to meet you.
Today you only need to show up as you are.
There is no shame in a side project that pays the bills.
Doing what you can with what you have is plenty.
You can ask what the salary range is. You can ask for time to decide.
Networking is just curiosity in good company.
You are not starting from zero; you’re starting from experience.
Good people get laid off. Good people get hired. Both are true.
Cheer for others and your own turn will feel lighter.
A gentle morning can set up a good day.
A pause between jobs is not a blank space; it’s a breath.
Name what you want, even if it’s only a first draft of a wish.
The people who matter will remember how you treated others in hard times.
The market changes; your ability to learn does not.
Ask better questions and you’ll find better answers.
Success is not a straight line — and neither is a good career.
Some of the best opportunities arrive in the middle of messy plans.
Give yourself credit for the days that took courage.
You’re not late. You’re on your own timeline.
You can’t control the economy, but you can control your next small step.
Let someone help you. Then, one day, help someone else.
Kindness to yourself is not laziness.
You’re allowed to change direction.
Every ‘thank you for your time’ email is a step closer to a ‘yes’.
Keep a list of what went well. Your memory will edit out the good parts.
Own your story. It’s more useful than any polished slogan.
Today’s version of you already knows more than last year’s.
Talk about what you’re looking for. People can’t help with what they don’t know.
Breathe in. You’re doing more than you think.
Curiosity travels well between industries.
You’re a person with a job history, not a job history with a person.
It’s okay to grieve the plans you made. It’s also okay to make new ones.
Hard times reveal who shows up. Thank them.
Don’t wait for permission to reinvent yourself.
Rebuilding is quiet work, and it still counts.
One honest conversation can change your whole week.
You’ve done difficult things before. This one is just new.
Plans are made to be rewritten.
Your work history is a library, not a verdict.
Learn something small every day and the future gets less scary.
Think of each interview as practice for the right one.
Good things take time — and so do good applications.
A calm mind finds more options.
People remember how you made them feel, not how perfect your résumé was.
Look after the basics first: food, sleep, a little movement.
No one has it all figured out, including the people who sound like they do.
Be proud of showing up on days that felt impossible.
Strength often looks like trying one more time, quietly.
Your next opportunity may come from someone you helped years ago.
You’re allowed to be both worried and hopeful.
Your value is steady even when the market isn’t.
Nothing about this moment cancels your potential.
Ask for what you need, and be specific.
You’ll look back on this season and see how much you learned.
The most important job right now is taking care of you.
There’s no prize for doing this alone.
Reach out before you feel ready. No one feels ready.
The world needs what you know how to do.
You’re building momentum even when it doesn’t feel like it.
Choose progress over perfection today.
You’re never too experienced to ask a basic question.
Be generous with your encouragement — it comes back around.
Move one inch closer to what you want. That’s enough for today.
Let tomorrow’s version of you thank today’s version for trying.
Small, repeated effort beats a single heroic push.
It’s not too late to learn something new.
Give your goals a deadline and your feelings a safe place.
Trust the slow work of rebuilding.""".split("\n")
for h in hand: add("hand", h)

# ---- T8: money / time / practical ---------------------------------------
practical = """A budget is a map, not a punishment.
Runway is a number, not a verdict.
Ask about the team before you ask about the perks.
Negotiation is a conversation, not a confrontation.
Prepare three stories; they answer most interview questions.
Write your wins with numbers. Numbers are easy to remember.
Keep a ‘brag file’ of kind words from colleagues.
A good résumé is clear, not crowded.
Treat every informational chat as a two-way street.
Set a stopping time for job-hunting each day.
Track your applications in a simple list. Your future self will be grateful.
One tailored application is worth five generic ones.
Follow up politely, once. Then let it go.
Research the interviewer, not just the company.
Practise out loud — your voice needs the rehearsal too.
Keep a pause between sending and checking your email.
Don’t accept the first number without a thoughtful pause.
A thank-you note can set you apart.
Break big goals into week-sized pieces.
Block time for learning, not only for applying.
Schedule rest the way you schedule interviews.
Ask for referrals — they’re how many people are hired.
Save the job description. It tells you what to practise.
Read your own résumé as if you were hiring.
If a role excites you, apply even if you meet 70% of it.
Keep your tone warm and your emails short.
If you freeze in an interview, ask for a moment. It’s allowed.
It’s okay to ask for the interview questions format in advance.
Note what you learn from every interview — it’s free coaching.
Contract and freelance work can be a bridge, not a downgrade.
You can negotiate the start date, the title, the review cycle and the pay.
Choose the offer that fits your life, not just your title.
A good manager is worth a lot more than a good perk.
Learn to say: ‘I’d like to think about it and get back to you.’
Be curious about how teams treat their people when things get hard.
Know your must-haves before you see the offer.
Keep your professional photo, headline and summary up to date.
Make it easy for people to recommend you.
Say what you’re open to, and let your network connect the dots.
Send the email. You can fix typos later; opportunities don’t wait.""".split("\n")
for h in practical: add("practical", h)

# ---- T9: if/then reframes -------------------------------------------------
ifs = ["If today feels heavy","If the search feels endless","If you’re tired of starting over","If you’re waiting on a reply","If your confidence is low","If you’re comparing yourself again","If you’re worried about money","If an interview didn’t go well","If it’s a quiet day","If you feel stuck"]
thens = ["let one small win be enough.","take a short walk and come back to it.","write down one thing you’re grateful for.","message a friend — no agenda.","remember: you’ve handled hard weeks before.","do the first ten minutes of the task and see how you feel.","choose one thing and let the rest wait.","talk to someone who’s been through it.","lower the bar and keep the habit.","give yourself a gentle restart."]
for i in ifs:
    for t in R.sample(thens, 9):
        add("ifthen", f"{i}, {t}")

# ---- T10: “Every …” ----------------------------------------------------
subj = ["conversation","application","interview","thank-you note","coffee chat","skill you learn","small habit","honest post","introduction","early morning","long walk","hard day","connection you make","question you ask","lesson you keep"]
res = ["moves you a little closer to what’s next.","is a seed you may not see grow yet.","counts, even when no one is watching.","adds to a story you’ll be proud of.","teaches you something you’ll use later.","builds trust that outlasts a job title.","makes the next one easier.","is proof you didn’t give up."]
for s in subj:
    for r in R.sample(res, 8):
        add("every", f"Every {s} {r}")

# ---- unique, shuffle ------------------------------------------------------
seen, uniq = set(), []
for t,q in quotes:
    k = q.lower()
    if k in seen or len(q) > 300: continue
    seen.add(k); uniq.append((t,q))
R.shuffle(uniq)

# ---- supporting lines (shared pool, picked per theme where it fits) --------
support = """One small step is still a step.
You’re not doing this alone.
The next chapter starts with a single sentence.
Be kind to yourself today.
Someone in this circle has been exactly where you are.
Progress is rarely loud.
You belong here, exactly as you are.
Take the pause, then take the next small step.
Good things start with a connection.
Your people are closer than they feel.
Today is enough. So are you.
Come back tomorrow and try again, gently.
Your story still has plenty of pages left.
Breathe. Then pick one thing.
You’ve been brave before. You’re being brave now.
Ask for help. It’s what this circle is for.
There’s no deadline on feeling okay again.
Someone out there is hoping to meet exactly you.
Rebuilding takes time, and time is on your side.
Share what you’re learning — someone needs it.
Keep going. Softly is still going.
Celebrate the quiet wins, too.
It’s okay to go one day at a time.
The right opportunity is looking for you, too.
You don’t have to have it all figured out.
Every step you take makes the next one easier.
This season will teach you things you’ll carry for life.
Your effort matters, even when results are slow.
Reach out — most people are glad to be asked.
Be proud of how far you’ve already come.
You’re allowed to rest and still be ambitious.
Lean on your community; that’s why it’s here.
Your skills are portable, and so is your worth.
It’s okay to ask for a little more time.
Gentle consistency beats frantic bursts.
Look after your energy; it’s part of the job search.
Remember to celebrate how much you’ve already handled.
New beginnings often feel like endings first.
Keep your hope close and your expectations kind.
You’re building more than a résumé — you’re building resilience.""".split("\n")

rows = []
by_theme_support = {}
for i,(t,q) in enumerate(uniq):
    s = support[(i*7 + len(q)) % len(support)]
    rows.append((q, s))

def esc(x): return x.replace("'", "''")
start = 8  # existing seven reminders use display_order 1-7
lines = ["-- About a thousand more daily reminders (generated by scripts/generate-reminders.py).",
         "-- Quotes are unique; ON CONFLICT keeps the migration safe to re-run on a copied database.",
         "INSERT INTO daily_reminders (id, reminder_quote, reminder_supporting_text, display_order) VALUES"]
vals = []
for n,(q,s) in enumerate(rows):
    vals.append(f"  (gen_random_uuid(), '{esc(q)}', '{esc(s)}', {start+n})")
lines.append(",\n".join(vals))
lines.append("ON CONFLICT (reminder_quote) DO NOTHING;")
out = os.path.join(os.path.dirname(__file__), "..", "migrations", "008_more_daily_reminders.sql")
open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(len(rows), "reminders")
