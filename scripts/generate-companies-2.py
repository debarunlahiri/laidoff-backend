#!/usr/bin/env python3
"""Generates migrations/010_seed_more_companies.sql. Run: python3 scripts/generate-companies-2.py"""
import os

# name | industry | headquarters | website
DATA = """
Rippling|Enterprise Software|San Francisco, CA|https://rippling.com
Gusto|Enterprise Software|San Francisco, CA|https://gusto.com
Brex|Fintech|San Francisco, CA|https://brex.com
Ramp|Fintech|New York, NY|https://ramp.com
Mercury|Fintech|San Francisco, CA|https://mercury.com
Airtable|Productivity|San Francisco, CA|https://airtable.com
Miro|Collaboration|San Francisco, CA|https://miro.com
Loom|Collaboration|San Francisco, CA|https://loom.com
Calendly|Productivity|Atlanta, GA|https://calendly.com
Grammarly|Productivity|San Francisco, CA|https://grammarly.com
Duolingo|Edtech|Pittsburgh, PA|https://duolingo.com
Coursera|Edtech|Mountain View, CA|https://coursera.org
Udemy|Edtech|San Francisco, CA|https://udemy.com
Chegg|Edtech|Santa Clara, CA|https://chegg.com
Khan Academy|Edtech|Mountain View, CA|https://khanacademy.org
Twitch|Entertainment|San Francisco, CA|https://twitch.tv
YouTube|Entertainment|San Bruno, CA|https://youtube.com
TikTok|Social Media|Los Angeles, CA|https://tiktok.com
Bumble|Social Media|Austin, TX|https://bumble.com
Match Group|Social Media|Dallas, TX|https://mtch.com
Tinder|Social Media|West Hollywood, CA|https://tinder.com
Medium|Media|San Francisco, CA|https://medium.com
Substack|Media|San Francisco, CA|https://substack.com
BuzzFeed|Media|New York, NY|https://buzzfeed.com
The New York Times|Media|New York, NY|https://nytimes.com
Bloomberg|Media & Finance|New York, NY|https://bloomberg.com
Thomson Reuters|Media & Data|Toronto, Canada|https://thomsonreuters.com
Gartner|Research|Stamford, CT|https://gartner.com
Nielsen|Data & Analytics|New York, NY|https://nielsen.com
Squarespace|Software|New York, NY|https://squarespace.com
Wix|Software|Tel Aviv, Israel|https://wix.com
GoDaddy|Internet Services|Tempe, AZ|https://godaddy.com
Namecheap|Internet Services|Phoenix, AZ|https://namecheap.com
DigitalOcean|Cloud|New York, NY|https://digitalocean.com
Linode|Cloud|Philadelphia, PA|https://linode.com
Rackspace|Cloud|San Antonio, TX|https://rackspace.com
Akamai|Internet Infrastructure|Cambridge, MA|https://akamai.com
Fastly|Internet Infrastructure|San Francisco, CA|https://fastly.com
Confluent|Data|Mountain View, CA|https://confluent.io
Cloudera|Data|Santa Clara, CA|https://cloudera.com
Teradata|Data|San Diego, CA|https://teradata.com
Informatica|Data|Redwood City, CA|https://informatica.com
Tableau|Data & Analytics|Seattle, WA|https://tableau.com
Looker|Data & Analytics|Santa Cruz, CA|https://looker.com
Alteryx|Data & Analytics|Irvine, CA|https://alteryx.com
Qlik|Data & Analytics|King of Prussia, PA|https://qlik.com
New Relic|Software|San Francisco, CA|https://newrelic.com
Dynatrace|Software|Waltham, MA|https://dynatrace.com
PagerDuty|Software|San Francisco, CA|https://pagerduty.com
Sentry|Developer Tools|San Francisco, CA|https://sentry.io
JetBrains|Developer Tools|Prague, Czechia|https://jetbrains.com
Postman|Developer Tools|San Francisco, CA|https://postman.com
Docker|Developer Tools|Palo Alto, CA|https://docker.com
Red Hat|Open Source|Raleigh, NC|https://redhat.com
Canonical|Open Source|London, UK|https://canonical.com
SUSE|Open Source|Nuremberg, Germany|https://suse.com
Mozilla|Open Source|Mountain View, CA|https://mozilla.org
Automattic|Open Source|Remote|https://automattic.com
Supabase|Developer Tools|Remote|https://supabase.com
Netlify|Developer Tools|San Francisco, CA|https://netlify.com
Heroku|Cloud|San Francisco, CA|https://heroku.com
Fly.io|Cloud|Chicago, IL|https://fly.io
Hugging Face|Artificial Intelligence|New York, NY|https://huggingface.co
Scale AI|Artificial Intelligence|San Francisco, CA|https://scale.com
Cohere|Artificial Intelligence|Toronto, Canada|https://cohere.com
Mistral AI|Artificial Intelligence|Paris, France|https://mistral.ai
Stability AI|Artificial Intelligence|London, UK|https://stability.ai
Midjourney|Artificial Intelligence|San Francisco, CA|https://midjourney.com
Perplexity|Artificial Intelligence|San Francisco, CA|https://perplexity.ai
xAI|Artificial Intelligence|Palo Alto, CA|https://x.ai
C3.ai|Artificial Intelligence|Redwood City, CA|https://c3.ai
UiPath|Automation|New York, NY|https://uipath.com
Automation Anywhere|Automation|San Jose, CA|https://automationanywhere.com
Samsara|IoT|San Francisco, CA|https://samsara.com
Rubrik|Security|Palo Alto, CA|https://rubrik.com
SentinelOne|Security|Mountain View, CA|https://sentinelone.com
Check Point|Security|Tel Aviv, Israel|https://checkpoint.com
Proofpoint|Security|Sunnyvale, CA|https://proofpoint.com
Mandiant|Security|Reston, VA|https://mandiant.com
1Password|Security|Toronto, Canada|https://1password.com
Dashlane|Security|New York, NY|https://dashlane.com
LastPass|Security|Boston, MA|https://lastpass.com
NortonLifeLock|Security|Tempe, AZ|https://norton.com
McAfee|Security|San Jose, CA|https://mcafee.com
Kaspersky|Security|Moscow, Russia|https://kaspersky.com
Arista Networks|Networking|Santa Clara, CA|https://arista.com
Juniper Networks|Networking|Sunnyvale, CA|https://juniper.net
F5|Networking|Seattle, WA|https://f5.com
Ubiquiti|Networking|New York, NY|https://ui.com
NetApp|Storage|San Jose, CA|https://netapp.com
Pure Storage|Storage|Mountain View, CA|https://purestorage.com
Western Digital|Storage|San Jose, CA|https://westerndigital.com
Seagate|Storage|Fremont, CA|https://seagate.com
Micron|Semiconductors|Boise, ID|https://micron.com
Texas Instruments|Semiconductors|Dallas, TX|https://ti.com
Analog Devices|Semiconductors|Wilmington, MA|https://analog.com
Marvell|Semiconductors|Santa Clara, CA|https://marvell.com
Applied Materials|Semiconductors|Santa Clara, CA|https://appliedmaterials.com
Lam Research|Semiconductors|Fremont, CA|https://lamresearch.com
ASML|Semiconductors|Veldhoven, Netherlands|https://asml.com
TSMC|Semiconductors|Hsinchu, Taiwan|https://tsmc.com
ARM|Semiconductors|Cambridge, UK|https://arm.com
MediaTek|Semiconductors|Hsinchu, Taiwan|https://mediatek.com
Foxconn|Electronics Manufacturing|New Taipei, Taiwan|https://foxconn.com
Xiaomi|Electronics|Beijing, China|https://mi.com
Huawei|Electronics & Telecom|Shenzhen, China|https://huawei.com
Lenovo|Hardware|Beijing, China|https://lenovo.com
Asus|Hardware|Taipei, Taiwan|https://asus.com
Acer|Hardware|New Taipei, Taiwan|https://acer.com
LG Electronics|Electronics|Seoul, South Korea|https://lg.com
Panasonic|Electronics|Osaka, Japan|https://panasonic.com
Hitachi|Industrial & Technology|Tokyo, Japan|https://hitachi.com
Fujitsu|IT Services|Tokyo, Japan|https://fujitsu.com
NEC|IT Services|Tokyo, Japan|https://nec.com
Canon|Electronics|Tokyo, Japan|https://canon.com
Nintendo|Gaming|Kyoto, Japan|https://nintendo.com
Ubisoft|Gaming|Montreuil, France|https://ubisoft.com
Take-Two Interactive|Gaming|New York, NY|https://take2games.com
Riot Games|Gaming|Los Angeles, CA|https://riotgames.com
Valve|Gaming|Bellevue, WA|https://valvesoftware.com
Zynga|Gaming|San Francisco, CA|https://zynga.com
Supercell|Gaming|Helsinki, Finland|https://supercell.com
King|Gaming|London, UK|https://king.com
Niantic|Gaming|San Francisco, CA|https://nianticlabs.com
Hotstar|Entertainment|Mumbai, India|https://hotstar.com
JioCinema|Entertainment|Mumbai, India|https://jiocinema.com
Sony Pictures|Entertainment|Culver City, CA|https://sonypictures.com
Universal Music Group|Entertainment|Santa Monica, CA|https://universalmusic.com
Live Nation|Entertainment|Beverly Hills, CA|https://livenation.com
BookMyShow|Entertainment|Mumbai, India|https://bookmyshow.com
Nykaa|E-commerce|Mumbai, India|https://nykaa.com
Lenskart|E-commerce|Delhi, India|https://lenskart.com
FirstCry|E-commerce|Pune, India|https://firstcry.com
Snapdeal|E-commerce|Delhi, India|https://snapdeal.com
BigBasket|E-commerce|Bengaluru, India|https://bigbasket.com
Blinkit|Delivery|Gurugram, India|https://blinkit.com
Zepto|Delivery|Mumbai, India|https://zeptonow.com
Dunzo|Delivery|Bengaluru, India|https://dunzo.com
Delhivery|Logistics|Gurugram, India|https://delhivery.com
Rapido|Mobility|Bengaluru, India|https://rapido.bike
Redbus|Travel|Bengaluru, India|https://redbus.in
OYO|Travel|Gurugram, India|https://oyorooms.com
Ixigo|Travel|Gurugram, India|https://ixigo.com
Cleartrip|Travel|Bengaluru, India|https://cleartrip.com
IndiGo|Airlines|Gurugram, India|https://goindigo.in
Air India|Airlines|Gurugram, India|https://airindia.com
Policybazaar|Fintech|Gurugram, India|https://policybazaar.com
Upstox|Fintech|Mumbai, India|https://upstox.com
Slice|Fintech|Bengaluru, India|https://sliceit.com
Jupiter|Fintech|Bengaluru, India|https://jupiter.money
Juspay|Fintech|Bengaluru, India|https://juspay.in
BharatPe|Fintech|Delhi, India|https://bharatpe.com
Pine Labs|Fintech|Noida, India|https://pinelabs.com
Cashfree|Fintech|Bengaluru, India|https://cashfree.com
Zeta|Fintech|Bengaluru, India|https://zeta.tech
Kotak Mahindra Bank|Banking|Mumbai, India|https://kotak.com
IDFC First Bank|Banking|Mumbai, India|https://idfcfirstbank.com
Bajaj Finserv|Finance|Pune, India|https://bajajfinserv.in
LIC|Insurance|Mumbai, India|https://licindia.in
Tata Motors|Automotive|Mumbai, India|https://tatamotors.com
Mahindra & Mahindra|Automotive|Mumbai, India|https://mahindra.com
Maruti Suzuki|Automotive|New Delhi, India|https://marutisuzuki.com
Hero MotoCorp|Automotive|New Delhi, India|https://heromotocorp.com
Bajaj Auto|Automotive|Pune, India|https://bajajauto.com
Ather Energy|Automotive|Bengaluru, India|https://atherenergy.com
Ola Electric|Automotive|Bengaluru, India|https://olaelectric.com
Larsen & Toubro|Engineering|Mumbai, India|https://larsentoubro.com
Tata Steel|Manufacturing|Mumbai, India|https://tatasteel.com
Adani Group|Conglomerate|Ahmedabad, India|https://adani.com
Tata Group|Conglomerate|Mumbai, India|https://tata.com
Aditya Birla Group|Conglomerate|Mumbai, India|https://adityabirla.com
Hindustan Unilever|Consumer Goods|Mumbai, India|https://hul.co.in
ITC|Consumer Goods|Kolkata, India|https://itcportal.com
Asian Paints|Manufacturing|Mumbai, India|https://asianpaints.com
Sun Pharma|Pharmaceuticals|Mumbai, India|https://sunpharma.com
Dr. Reddy's Laboratories|Pharmaceuticals|Hyderabad, India|https://drreddys.com
Cipla|Pharmaceuticals|Mumbai, India|https://cipla.com
Biocon|Biotech|Bengaluru, India|https://biocon.com
Apollo Hospitals|Healthcare|Chennai, India|https://apollohospitals.com
Practo|Healthtech|Bengaluru, India|https://practo.com
Pharmeasy|Healthtech|Mumbai, India|https://pharmeasy.in
1mg|Healthtech|Gurugram, India|https://1mg.com
Cure.fit|Healthtech|Bengaluru, India|https://cult.fit
PhysicsWallah|Edtech|Noida, India|https://pw.live
Vedantu|Edtech|Bengaluru, India|https://vedantu.com
Scaler|Edtech|Bengaluru, India|https://scaler.com
Coding Ninjas|Edtech|Gurugram, India|https://codingninjas.com
GeeksforGeeks|Edtech|Noida, India|https://geeksforgeeks.org
ShareChat|Social Media|Bengaluru, India|https://sharechat.com
Koo|Social Media|Bengaluru, India|https://kooapp.com
Dailyhunt|Media|Bengaluru, India|https://dailyhunt.in
Times Internet|Media|Noida, India|https://timesinternet.in
Hike|Social Media|Delhi, India|https://hike.in
Gupshup|Communications|Bengaluru, India|https://gupshup.io
Exotel|Communications|Bengaluru, India|https://exotel.com
BrowserStack|Developer Tools|Mumbai, India|https://browserstack.com
Chargebee|Software|Chennai, India|https://chargebee.com
Clevertap|Software|Mumbai, India|https://clevertap.com
Druva|Software|Pune, India|https://druva.com
Icertis|Software|Pune, India|https://icertis.com
Nutanix|Cloud|San Jose, CA|https://nutanix.com
Sprinklr|Software|New York, NY|https://sprinklr.com
Whatfix|Software|Bengaluru, India|https://whatfix.com
Darwinbox|Software|Hyderabad, India|https://darwinbox.com
Hasura|Developer Tools|Bengaluru, India|https://hasura.io
Mindtree|IT Services|Bengaluru, India|https://mindtree.com
Hexaware|IT Services|Mumbai, India|https://hexaware.com
Coforge|IT Services|Noida, India|https://coforge.com
Zensar|IT Services|Pune, India|https://zensar.com
Birlasoft|IT Services|Noida, India|https://birlasoft.com
Cyient|IT Services|Hyderabad, India|https://cyient.com
Sonata Software|IT Services|Bengaluru, India|https://sonata-software.com
Virtusa|IT Services|Southborough, MA|https://virtusa.com
EPAM Systems|IT Services|Newtown, PA|https://epam.com
Globant|IT Services|Luxembourg|https://globant.com
Thoughtworks|IT Services|Chicago, IL|https://thoughtworks.com
Endava|IT Services|London, UK|https://endava.com
DXC Technology|IT Services|Ashburn, VA|https://dxc.com
Kyndryl|IT Services|New York, NY|https://kyndryl.com
NTT Data|IT Services|Tokyo, Japan|https://nttdata.com
Atos|IT Services|Bezons, France|https://atos.net
Genpact|Business Services|New York, NY|https://genpact.com
Concentrix|Business Services|Fremont, CA|https://concentrix.com
Teleperformance|Business Services|Paris, France|https://teleperformance.com
Conduent|Business Services|Florham Park, NJ|https://conduent.com
Amdocs|Software|Chesterfield, MO|https://amdocs.com
Sutherland|Business Services|Pittsford, NY|https://sutherlandglobal.com
WNS|Business Services|Mumbai, India|https://wns.com
ExlService|Business Services|New York, NY|https://exlservice.com
Randstad|Staffing|Diemen, Netherlands|https://randstad.com
Adecco|Staffing|Zurich, Switzerland|https://adecco.com
ManpowerGroup|Staffing|Milwaukee, WI|https://manpowergroup.com
Robert Half|Staffing|Menlo Park, CA|https://roberthalf.com
Indeed|Recruiting|Austin, TX|https://indeed.com
Glassdoor|Recruiting|Mill Valley, CA|https://glassdoor.com
ZipRecruiter|Recruiting|Santa Monica, CA|https://ziprecruiter.com
Naukri (Info Edge)|Recruiting|Noida, India|https://infoedge.in
Greenhouse|Recruiting|New York, NY|https://greenhouse.com
Lever|Recruiting|San Francisco, CA|https://lever.co
Upwork|Freelance|San Francisco, CA|https://upwork.com
Fiverr|Freelance|Tel Aviv, Israel|https://fiverr.com
Toptal|Freelance|Remote|https://toptal.com
Deel|HR Tech|San Francisco, CA|https://deel.com
Remote|HR Tech|Remote|https://remote.com
Oyster|HR Tech|Remote|https://oysterhr.com
Papaya Global|HR Tech|Tel Aviv, Israel|https://papayaglobal.com
Hired|Recruiting|San Francisco, CA|https://hired.com
Triplebyte|Recruiting|San Francisco, CA|https://triplebyte.com
Bolt|Fintech|San Francisco, CA|https://bolt.com
Checkout.com|Fintech|London, UK|https://checkout.com
Adyen|Fintech|Amsterdam, Netherlands|https://adyen.com
Worldpay|Fintech|Cincinnati, OH|https://worldpay.com
Fiserv|Fintech|Milwaukee, WI|https://fiserv.com
FIS|Fintech|Jacksonville, FL|https://fisglobal.com
Global Payments|Fintech|Atlanta, GA|https://globalpayments.com
Marqeta|Fintech|Oakland, CA|https://marqeta.com
SoFi|Fintech|San Francisco, CA|https://sofi.com
Upstart|Fintech|San Mateo, CA|https://upstart.com
LendingClub|Fintech|San Francisco, CA|https://lendingclub.com
Carta|Fintech|Palo Alto, CA|https://carta.com
Bill.com|Fintech|San Jose, CA|https://bill.com
Avalara|Fintech|Seattle, WA|https://avalara.com
Toast|Fintech|Boston, MA|https://toasttab.com
Lightspeed|Software|Montreal, Canada|https://lightspeedhq.com
Nuvei|Fintech|Montreal, Canada|https://nuvei.com
Binance|Crypto|Remote|https://binance.com
Kraken|Crypto|San Francisco, CA|https://kraken.com
Gemini|Crypto|New York, NY|https://gemini.com
Ripple|Crypto|San Francisco, CA|https://ripple.com
Consensys|Crypto|New York, NY|https://consensys.net
Chainalysis|Crypto|New York, NY|https://chainalysis.com
Block.one|Crypto|Remote|https://block.one
CoinDCX|Crypto|Mumbai, India|https://coindcx.com
WazirX|Crypto|Mumbai, India|https://wazirx.com
Polygon|Crypto|Bengaluru, India|https://polygon.technology
Charles Schwab|Finance|Westlake, TX|https://schwab.com
Fidelity|Finance|Boston, MA|https://fidelity.com
Vanguard|Asset Management|Malvern, PA|https://vanguard.com
State Street|Finance|Boston, MA|https://statestreet.com
Citadel|Finance|Miami, FL|https://citadel.com
Jane Street|Finance|New York, NY|https://janestreet.com
Two Sigma|Finance|New York, NY|https://twosigma.com
Jump Trading|Finance|Chicago, IL|https://jumptrading.com
Optiver|Finance|Amsterdam, Netherlands|https://optiver.com
IMC Trading|Finance|Amsterdam, Netherlands|https://imc.com
DE Shaw|Finance|New York, NY|https://deshaw.com
Bridgewater Associates|Finance|Westport, CT|https://bridgewater.com
Blackstone|Finance|New York, NY|https://blackstone.com
KKR|Finance|New York, NY|https://kkr.com
Carlyle|Finance|Washington, DC|https://carlyle.com
Sequoia Capital|Venture Capital|Menlo Park, CA|https://sequoiacap.com
Andreessen Horowitz|Venture Capital|Menlo Park, CA|https://a16z.com
Y Combinator|Venture Capital|San Francisco, CA|https://ycombinator.com
SoftBank|Venture Capital|Tokyo, Japan|https://softbank.com
Accel|Venture Capital|Palo Alto, CA|https://accel.com
Lightspeed Venture Partners|Venture Capital|Menlo Park, CA|https://lsvp.com
Allianz|Insurance|Munich, Germany|https://allianz.com
AXA|Insurance|Paris, France|https://axa.com
AIG|Insurance|New York, NY|https://aig.com
MetLife|Insurance|New York, NY|https://metlife.com
Prudential|Insurance|Newark, NJ|https://prudential.com
Lemonade|Insurance|New York, NY|https://lemonade.com
Oscar Health|Insurance|New York, NY|https://hioscar.com
Cigna|Healthcare|Bloomfield, CT|https://cigna.com
Anthem|Healthcare|Indianapolis, IN|https://antheminc.com
Kaiser Permanente|Healthcare|Oakland, CA|https://kaiserpermanente.org
HCA Healthcare|Healthcare|Nashville, TN|https://hcahealthcare.com
Teladoc|Healthtech|Purchase, NY|https://teladochealth.com
Hims & Hers|Healthtech|San Francisco, CA|https://forhims.com
23andMe|Healthtech|South San Francisco, CA|https://23andme.com
Illumina|Biotech|San Diego, CA|https://illumina.com
Thermo Fisher Scientific|Life Sciences|Waltham, MA|https://thermofisher.com
Abbott|Healthcare|Abbott Park, IL|https://abbott.com
Medtronic|Medical Devices|Dublin, Ireland|https://medtronic.com
GE Healthcare|Medical Devices|Chicago, IL|https://gehealthcare.com
Siemens Healthineers|Medical Devices|Erlangen, Germany|https://siemens-healthineers.com
Merck|Pharmaceuticals|Rahway, NJ|https://merck.com
AbbVie|Pharmaceuticals|North Chicago, IL|https://abbvie.com
Bristol Myers Squibb|Pharmaceuticals|New York, NY|https://bms.com
Eli Lilly|Pharmaceuticals|Indianapolis, IN|https://lilly.com
AstraZeneca|Pharmaceuticals|Cambridge, UK|https://astrazeneca.com
GSK|Pharmaceuticals|London, UK|https://gsk.com
Sanofi|Pharmaceuticals|Paris, France|https://sanofi.com
Bayer|Pharmaceuticals|Leverkusen, Germany|https://bayer.com
Amgen|Biotech|Thousand Oaks, CA|https://amgen.com
Gilead Sciences|Biotech|Foster City, CA|https://gilead.com
Genentech|Biotech|South San Francisco, CA|https://gene.com
Walgreens|Retail & Healthcare|Deerfield, IL|https://walgreens.com
Kroger|Retail|Cincinnati, OH|https://kroger.com
Albertsons|Retail|Boise, ID|https://albertsonscompanies.com
Lowe's|Retail|Mooresville, NC|https://lowes.com
Macy's|Retail|New York, NY|https://macys.com
Nordstrom|Retail|Seattle, WA|https://nordstrom.com
Gap|Retail|San Francisco, CA|https://gapinc.com
H&M|Retail|Stockholm, Sweden|https://hm.com
Zara (Inditex)|Retail|Arteixo, Spain|https://inditex.com
IKEA|Retail|Delft, Netherlands|https://ikea.com
Lululemon|Apparel|Vancouver, Canada|https://lululemon.com
Under Armour|Apparel|Baltimore, MD|https://underarmour.com
Levi Strauss|Apparel|San Francisco, CA|https://levistrauss.com
Puma|Apparel|Herzogenaurach, Germany|https://puma.com
Chipotle|Food & Beverage|Newport Beach, CA|https://chipotle.com
Domino's|Food & Beverage|Ann Arbor, MI|https://dominos.com
Yum! Brands|Food & Beverage|Louisville, KY|https://yum.com
Mondelez|Food & Beverage|Chicago, IL|https://mondelezinternational.com
Kraft Heinz|Food & Beverage|Chicago, IL|https://kraftheinzcompany.com
Danone|Food & Beverage|Paris, France|https://danone.com
Mars|Food & Beverage|McLean, VA|https://mars.com
AB InBev|Food & Beverage|Leuven, Belgium|https://ab-inbev.com
Beyond Meat|Food & Beverage|El Segundo, CA|https://beyondmeat.com
L'Oréal|Consumer Goods|Clichy, France|https://loreal.com
Estée Lauder|Consumer Goods|New York, NY|https://elcompanies.com
Colgate-Palmolive|Consumer Goods|New York, NY|https://colgatepalmolive.com
Kimberly-Clark|Consumer Goods|Irving, TX|https://kimberly-clark.com
Reckitt|Consumer Goods|Slough, UK|https://reckitt.com
Haleon|Consumer Goods|Brentford, UK|https://haleon.com
Exxon Mobil|Energy|Spring, TX|https://corporate.exxonmobil.com
Chevron|Energy|San Ramon, CA|https://chevron.com
Shell|Energy|London, UK|https://shell.com
BP|Energy|London, UK|https://bp.com
TotalEnergies|Energy|Courbevoie, France|https://totalenergies.com
Schlumberger|Energy|Houston, TX|https://slb.com
Halliburton|Energy|Houston, TX|https://halliburton.com
NextEra Energy|Energy|Juno Beach, FL|https://nexteraenergy.com
Enphase Energy|Energy|Fremont, CA|https://enphase.com
First Solar|Energy|Tempe, AZ|https://firstsolar.com
SunPower|Energy|San Jose, CA|https://sunpower.com
Vestas|Energy|Aarhus, Denmark|https://vestas.com
Schneider Electric|Industrial|Rueil-Malmaison, France|https://se.com
ABB|Industrial|Zurich, Switzerland|https://abb.com
Honeywell|Industrial|Charlotte, NC|https://honeywell.com
3M|Industrial|Saint Paul, MN|https://3m.com
Caterpillar|Industrial|Irving, TX|https://caterpillar.com
Deere & Company|Industrial|Moline, IL|https://deere.com
Emerson|Industrial|Saint Louis, MO|https://emerson.com
Rockwell Automation|Industrial|Milwaukee, WI|https://rockwellautomation.com
Bosch|Industrial|Gerlingen, Germany|https://bosch.com
Continental|Automotive|Hanover, Germany|https://continental.com
Magna|Automotive|Aurora, Canada|https://magna.com
Stellantis|Automotive|Amsterdam, Netherlands|https://stellantis.com
Honda|Automotive|Tokyo, Japan|https://honda.com
Nissan|Automotive|Yokohama, Japan|https://nissan-global.com
Hyundai|Automotive|Seoul, South Korea|https://hyundai.com
Kia|Automotive|Seoul, South Korea|https://kia.com
BYD|Automotive|Shenzhen, China|https://byd.com
NIO|Automotive|Shanghai, China|https://nio.com
Airbus|Aerospace|Leiden, Netherlands|https://airbus.com
Raytheon|Aerospace & Defense|Arlington, VA|https://rtx.com
Northrop Grumman|Aerospace & Defense|Falls Church, VA|https://northropgrumman.com
General Dynamics|Aerospace & Defense|Reston, VA|https://gd.com
BAE Systems|Aerospace & Defense|London, UK|https://baesystems.com
Rolls-Royce|Aerospace|London, UK|https://rolls-royce.com
Blue Origin|Aerospace|Kent, WA|https://blueorigin.com
Rocket Lab|Aerospace|Long Beach, CA|https://rocketlabusa.com
Planet Labs|Aerospace|San Francisco, CA|https://planet.com
ISRO|Aerospace|Bengaluru, India|https://isro.gov.in
Hindustan Aeronautics|Aerospace & Defense|Bengaluru, India|https://hal-india.co.in
DRDO|Aerospace & Defense|New Delhi, India|https://drdo.gov.in
Boston Dynamics|Robotics|Waltham, MA|https://bostondynamics.com
iRobot|Robotics|Bedford, MA|https://irobot.com
Aurora Innovation|Autonomous Vehicles|Pittsburgh, PA|https://aurora.tech
Zoox|Autonomous Vehicles|Foster City, CA|https://zoox.com
Nuro|Autonomous Vehicles|Mountain View, CA|https://nuro.ai
Rimac|Automotive|Zagreb, Croatia|https://rimac-automobili.com
Tata Elxsi|Engineering|Bengaluru, India|https://tataelxsi.com
KPIT|Automotive Technology|Pune, India|https://kpit.com
Bharat Electronics|Defense Electronics|Bengaluru, India|https://bel-india.in
BHEL|Industrial|New Delhi, India|https://bhel.com
ONGC|Energy|New Delhi, India|https://ongcindia.com
Indian Oil|Energy|New Delhi, India|https://iocl.com
NTPC|Energy|New Delhi, India|https://ntpc.co.in
Bharti Airtel|Telecom|New Delhi, India|https://airtel.in
Vodafone Idea|Telecom|Mumbai, India|https://myvi.in
BSNL|Telecom|New Delhi, India|https://bsnl.co.in
Zee Entertainment|Media|Mumbai, India|https://zee.com
Star India|Media|Mumbai, India|https://starindia.com
Sony Pictures Networks India|Media|Mumbai, India|https://sonyliv.com
Eros Now|Entertainment|Mumbai, India|https://erosnow.com
Gaana|Entertainment|Gurugram, India|https://gaana.com
JioSaavn|Entertainment|Mumbai, India|https://jiosaavn.com
Pocket FM|Entertainment|Bengaluru, India|https://pocketfm.com
Kuku FM|Entertainment|Mumbai, India|https://kukufm.com
MPL|Gaming|Bengaluru, India|https://mpl.live
Games24x7|Gaming|Mumbai, India|https://games24x7.com
Nazara|Gaming|Mumbai, India|https://nazara.com
Krafton|Gaming|Seoul, South Korea|https://krafton.com
NetEase|Gaming|Hangzhou, China|https://netease.com
miHoYo|Gaming|Shanghai, China|https://mihoyo.com
Baidu|Technology|Beijing, China|https://baidu.com
JD.com|E-commerce|Beijing, China|https://jd.com
Pinduoduo|E-commerce|Shanghai, China|https://pinduoduo.com
Meituan|Delivery|Beijing, China|https://meituan.com
DiDi|Mobility|Beijing, China|https://didiglobal.com
Ant Group|Fintech|Hangzhou, China|https://antgroup.com
Shein|E-commerce|Singapore|https://shein.com
Temu|E-commerce|Boston, MA|https://temu.com
SoundCloud|Entertainment|Berlin, Germany|https://soundcloud.com
SAP Concur|Enterprise Software|Bellevue, WA|https://concur.com
Celonis|Software|Munich, Germany|https://celonis.com
DeepL|Artificial Intelligence|Cologne, Germany|https://deepl.com
Trivago|Travel|Düsseldorf, Germany|https://trivago.com
HelloFresh|Food & Beverage|Berlin, Germany|https://hellofresh.com
Ocado|Retail|Hatfield, UK|https://ocado.com
Tesco|Retail|Welwyn Garden City, UK|https://tescoplc.com
Sainsbury's|Retail|London, UK|https://about.sainsburys.co.uk
Lloyds Banking Group|Banking|London, UK|https://lloydsbankinggroup.com
NatWest Group|Banking|Edinburgh, UK|https://natwestgroup.com
Standard Chartered|Banking|London, UK|https://sc.com
BNP Paribas|Banking|Paris, France|https://group.bnpparibas
Société Générale|Banking|Paris, France|https://societegenerale.com
ING|Banking|Amsterdam, Netherlands|https://ing.com
Santander|Banking|Madrid, Spain|https://santander.com
BBVA|Banking|Bilbao, Spain|https://bbva.com
RBC|Banking|Toronto, Canada|https://rbc.com
TD Bank|Banking|Toronto, Canada|https://td.com
Scotiabank|Banking|Toronto, Canada|https://scotiabank.com
BlackBerry|Technology|Waterloo, Canada|https://blackberry.com
OpenText|Software|Waterloo, Canada|https://opentext.com
Telus|Telecom|Vancouver, Canada|https://telus.com
Rogers Communications|Telecom|Toronto, Canada|https://rogers.com
CGI|IT Services|Montreal, Canada|https://cgi.com
Afterpay|Fintech|Melbourne, Australia|https://afterpay.com
Commonwealth Bank|Banking|Sydney, Australia|https://commbank.com.au
Telstra|Telecom|Melbourne, Australia|https://telstra.com
Woolworths Group|Retail|Bella Vista, Australia|https://woolworthsgroup.com.au
Careem|Mobility|Dubai, UAE|https://careem.com
Noon|E-commerce|Dubai, UAE|https://noon.com
Talabat|Delivery|Dubai, UAE|https://talabat.com
Etisalat|Telecom|Abu Dhabi, UAE|https://etisalat.ae
Saudi Aramco|Energy|Dhahran, Saudi Arabia|https://aramco.com
STC|Telecom|Riyadh, Saudi Arabia|https://stc.com.sa
Monday.com|Productivity|Tel Aviv, Israel|https://monday.com
Wiz|Security|New York, NY|https://wiz.io
Teva|Pharmaceuticals|Tel Aviv, Israel|https://tevapharm.com
Naspers|Technology|Cape Town, South Africa|https://naspers.com
Takealot|E-commerce|Cape Town, South Africa|https://takealot.com
Flutterwave|Fintech|San Francisco, CA|https://flutterwave.com
Paystack|Fintech|Lagos, Nigeria|https://paystack.com
Jumia|E-commerce|Berlin, Germany|https://jumia.com
Safaricom|Telecom|Nairobi, Kenya|https://safaricom.co.ke
MercadoLibre|E-commerce|Montevideo, Uruguay|https://mercadolibre.com
Nubank|Fintech|São Paulo, Brazil|https://nubank.com.br
iFood|Delivery|São Paulo, Brazil|https://ifood.com.br
Rappi|Delivery|Bogotá, Colombia|https://rappi.com
Despegar|Travel|Buenos Aires, Argentina|https://despegar.com
Globo|Media|Rio de Janeiro, Brazil|https://globo.com
Itaú Unibanco|Banking|São Paulo, Brazil|https://itau.com.br
"""

def q(v):
    return "'" + v.replace("'", "''") + "'"

rows, seen = [], set()
for line in DATA.strip().splitlines():
    name, industry, hq, site = [p.strip() for p in line.split("|")]
    if name.lower() in seen:
        continue
    seen.add(name.lower())
    rows.append(f"  (gen_random_uuid(), {q(name)}, {q(industry)}, {q(hq)}, {q(site)})")

out = (
    "-- More well-known employers (generated by scripts/generate-companies-2.py).\n"
    "-- Names unique case-insensitively; anything already present is skipped.\n"
    "INSERT INTO companies (id, company_name, industry_name, headquarters_location, website_url) VALUES\n"
    + ",\n".join(rows)
    + "\nON CONFLICT (lower(company_name)) DO NOTHING;\n"
)
path = os.path.join(os.path.dirname(__file__), "..", "migrations", "010_seed_more_companies.sql")
open(path, "w", encoding="utf-8").write(out)
print(f"wrote {len(rows)} companies")
