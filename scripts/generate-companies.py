#!/usr/bin/env python3
"""Generates migrations/009_seed_companies.sql. Run: python3 scripts/generate-companies.py"""
import os

# name | industry | headquarters | website
DATA = """
Google|Technology|Mountain View, CA|https://google.com
Microsoft|Technology|Redmond, WA|https://microsoft.com
Amazon|E-commerce & Cloud|Seattle, WA|https://amazon.com
Apple|Technology|Cupertino, CA|https://apple.com
Meta|Social Media|Menlo Park, CA|https://meta.com
Netflix|Entertainment|Los Gatos, CA|https://netflix.com
Tesla|Automotive|Austin, TX|https://tesla.com
Nvidia|Semiconductors|Santa Clara, CA|https://nvidia.com
Intel|Semiconductors|Santa Clara, CA|https://intel.com
AMD|Semiconductors|Santa Clara, CA|https://amd.com
Qualcomm|Semiconductors|San Diego, CA|https://qualcomm.com
Broadcom|Semiconductors|San Jose, CA|https://broadcom.com
Cisco|Networking|San Jose, CA|https://cisco.com
Oracle|Enterprise Software|Austin, TX|https://oracle.com
IBM|Technology & Consulting|Armonk, NY|https://ibm.com
Salesforce|Enterprise Software|San Francisco, CA|https://salesforce.com
Adobe|Software|San Jose, CA|https://adobe.com
SAP|Enterprise Software|Walldorf, Germany|https://sap.com
VMware|Software|Palo Alto, CA|https://vmware.com
Dell Technologies|Hardware|Round Rock, TX|https://dell.com
HP|Hardware|Palo Alto, CA|https://hp.com
HPE|Hardware & Cloud|Houston, TX|https://hpe.com
Uber|Mobility|San Francisco, CA|https://uber.com
Lyft|Mobility|San Francisco, CA|https://lyft.com
Airbnb|Travel|San Francisco, CA|https://airbnb.com
DoorDash|Delivery|San Francisco, CA|https://doordash.com
Instacart|Delivery|San Francisco, CA|https://instacart.com
Stripe|Fintech|San Francisco, CA|https://stripe.com
Square (Block)|Fintech|San Francisco, CA|https://block.xyz
PayPal|Fintech|San Jose, CA|https://paypal.com
Coinbase|Crypto|Remote|https://coinbase.com
Robinhood|Fintech|Menlo Park, CA|https://robinhood.com
Twilio|Communications|San Francisco, CA|https://twilio.com
Slack|Collaboration|San Francisco, CA|https://slack.com
Zoom|Communications|San Jose, CA|https://zoom.us
Dropbox|Software|San Francisco, CA|https://dropbox.com
Box|Software|Redwood City, CA|https://box.com
Atlassian|Software|Sydney, Australia|https://atlassian.com
Shopify|E-commerce|Ottawa, Canada|https://shopify.com
Snap|Social Media|Santa Monica, CA|https://snap.com
Pinterest|Social Media|San Francisco, CA|https://pinterest.com
X (Twitter)|Social Media|San Francisco, CA|https://x.com
LinkedIn|Social Media|Sunnyvale, CA|https://linkedin.com
Reddit|Social Media|San Francisco, CA|https://redditinc.com
Discord|Social Media|San Francisco, CA|https://discord.com
Spotify|Entertainment|Stockholm, Sweden|https://spotify.com
Roblox|Gaming|San Mateo, CA|https://roblox.com
Electronic Arts|Gaming|Redwood City, CA|https://ea.com
Activision Blizzard|Gaming|Santa Monica, CA|https://activisionblizzard.com
Unity|Gaming|San Francisco, CA|https://unity.com
Epic Games|Gaming|Cary, NC|https://epicgames.com
Snowflake|Data & Cloud|Bozeman, MT|https://snowflake.com
Databricks|Data & AI|San Francisco, CA|https://databricks.com
Palantir|Data & AI|Denver, CO|https://palantir.com
OpenAI|Artificial Intelligence|San Francisco, CA|https://openai.com
Anthropic|Artificial Intelligence|San Francisco, CA|https://anthropic.com
DeepMind|Artificial Intelligence|London, UK|https://deepmind.google
Cloudflare|Internet Infrastructure|San Francisco, CA|https://cloudflare.com
Datadog|Software|New York, NY|https://datadoghq.com
Splunk|Software|San Francisco, CA|https://splunk.com
MongoDB|Database|New York, NY|https://mongodb.com
Elastic|Software|Mountain View, CA|https://elastic.co
HashiCorp|Software|San Francisco, CA|https://hashicorp.com
GitHub|Developer Tools|San Francisco, CA|https://github.com
GitLab|Developer Tools|Remote|https://gitlab.com
Vercel|Developer Tools|San Francisco, CA|https://vercel.com
Figma|Design Software|San Francisco, CA|https://figma.com
Canva|Design Software|Sydney, Australia|https://canva.com
Notion|Productivity|San Francisco, CA|https://notion.so
Asana|Productivity|San Francisco, CA|https://asana.com
Workday|Enterprise Software|Pleasanton, CA|https://workday.com
ServiceNow|Enterprise Software|Santa Clara, CA|https://servicenow.com
Intuit|Fintech Software|Mountain View, CA|https://intuit.com
Autodesk|Software|San Francisco, CA|https://autodesk.com
Zendesk|Software|San Francisco, CA|https://zendesk.com
HubSpot|Software|Cambridge, MA|https://hubspot.com
Okta|Security|San Francisco, CA|https://okta.com
CrowdStrike|Security|Austin, TX|https://crowdstrike.com
Palo Alto Networks|Security|Santa Clara, CA|https://paloaltonetworks.com
Zscaler|Security|San Jose, CA|https://zscaler.com
Fortinet|Security|Sunnyvale, CA|https://fortinet.com
Walmart|Retail|Bentonville, AR|https://walmart.com
Target|Retail|Minneapolis, MN|https://target.com
Costco|Retail|Issaquah, WA|https://costco.com
Home Depot|Retail|Atlanta, GA|https://homedepot.com
Best Buy|Retail|Richfield, MN|https://bestbuy.com
eBay|E-commerce|San Jose, CA|https://ebay.com
Etsy|E-commerce|Brooklyn, NY|https://etsy.com
Wayfair|E-commerce|Boston, MA|https://wayfair.com
Zalando|E-commerce|Berlin, Germany|https://zalando.com
Alibaba|E-commerce|Hangzhou, China|https://alibaba.com
Tencent|Technology|Shenzhen, China|https://tencent.com
ByteDance|Social Media|Beijing, China|https://bytedance.com
Samsung|Electronics|Seoul, South Korea|https://samsung.com
Sony|Electronics & Entertainment|Tokyo, Japan|https://sony.com
Rakuten|E-commerce|Tokyo, Japan|https://rakuten.com
Flipkart|E-commerce|Bengaluru, India|https://flipkart.com
Amazon India|E-commerce|Bengaluru, India|https://amazon.in
Myntra|E-commerce|Bengaluru, India|https://myntra.com
Meesho|E-commerce|Bengaluru, India|https://meesho.com
Swiggy|Delivery|Bengaluru, India|https://swiggy.com
Zomato|Delivery|Gurugram, India|https://zomato.com
Ola|Mobility|Bengaluru, India|https://olacabs.com
Paytm|Fintech|Noida, India|https://paytm.com
PhonePe|Fintech|Bengaluru, India|https://phonepe.com
Razorpay|Fintech|Bengaluru, India|https://razorpay.com
CRED|Fintech|Bengaluru, India|https://cred.club
Zerodha|Fintech|Bengaluru, India|https://zerodha.com
Groww|Fintech|Bengaluru, India|https://groww.in
Byju's|Edtech|Bengaluru, India|https://byjus.com
Unacademy|Edtech|Bengaluru, India|https://unacademy.com
upGrad|Edtech|Mumbai, India|https://upgrad.com
Freshworks|Software|Chennai, India|https://freshworks.com
Zoho|Software|Chennai, India|https://zoho.com
InMobi|Advertising|Bengaluru, India|https://inmobi.com
Dream11|Gaming|Mumbai, India|https://dream11.com
Reliance Jio|Telecom|Mumbai, India|https://jio.com
Reliance Industries|Conglomerate|Mumbai, India|https://ril.com
Tata Consultancy Services|IT Services|Mumbai, India|https://tcs.com
Infosys|IT Services|Bengaluru, India|https://infosys.com
Wipro|IT Services|Bengaluru, India|https://wipro.com
HCLTech|IT Services|Noida, India|https://hcltech.com
Tech Mahindra|IT Services|Pune, India|https://techmahindra.com
LTIMindtree|IT Services|Mumbai, India|https://ltimindtree.com
Mphasis|IT Services|Bengaluru, India|https://mphasis.com
Persistent Systems|IT Services|Pune, India|https://persistent.com
Cognizant|IT Services|Teaneck, NJ|https://cognizant.com
Capgemini|IT Services|Paris, France|https://capgemini.com
Accenture|Consulting|Dublin, Ireland|https://accenture.com
Deloitte|Consulting|London, UK|https://deloitte.com
PwC|Consulting|London, UK|https://pwc.com
EY|Consulting|London, UK|https://ey.com
KPMG|Consulting|London, UK|https://kpmg.com
McKinsey & Company|Consulting|New York, NY|https://mckinsey.com
Boston Consulting Group|Consulting|Boston, MA|https://bcg.com
Bain & Company|Consulting|Boston, MA|https://bain.com
Goldman Sachs|Finance|New York, NY|https://goldmansachs.com
Morgan Stanley|Finance|New York, NY|https://morganstanley.com
JPMorgan Chase|Finance|New York, NY|https://jpmorganchase.com
Bank of America|Finance|Charlotte, NC|https://bankofamerica.com
Citigroup|Finance|New York, NY|https://citigroup.com
Wells Fargo|Finance|San Francisco, CA|https://wellsfargo.com
Barclays|Finance|London, UK|https://barclays.com
HSBC|Finance|London, UK|https://hsbc.com
Deutsche Bank|Finance|Frankfurt, Germany|https://db.com
UBS|Finance|Zurich, Switzerland|https://ubs.com
Credit Suisse|Finance|Zurich, Switzerland|https://credit-suisse.com
BlackRock|Asset Management|New York, NY|https://blackrock.com
Visa|Payments|San Francisco, CA|https://visa.com
Mastercard|Payments|Purchase, NY|https://mastercard.com
American Express|Finance|New York, NY|https://americanexpress.com
Capital One|Finance|McLean, VA|https://capitalone.com
HDFC Bank|Banking|Mumbai, India|https://hdfcbank.com
ICICI Bank|Banking|Mumbai, India|https://icicibank.com
State Bank of India|Banking|Mumbai, India|https://sbi.co.in
Axis Bank|Banking|Mumbai, India|https://axisbank.com
Johnson & Johnson|Healthcare|New Brunswick, NJ|https://jnj.com
Pfizer|Pharmaceuticals|New York, NY|https://pfizer.com
Moderna|Biotech|Cambridge, MA|https://modernatx.com
Novartis|Pharmaceuticals|Basel, Switzerland|https://novartis.com
Roche|Pharmaceuticals|Basel, Switzerland|https://roche.com
UnitedHealth Group|Healthcare|Minnetonka, MN|https://unitedhealthgroup.com
CVS Health|Healthcare|Woonsocket, RI|https://cvshealth.com
Philips|Healthcare Technology|Amsterdam, Netherlands|https://philips.com
Siemens|Industrial|Munich, Germany|https://siemens.com
General Electric|Industrial|Boston, MA|https://ge.com
Boeing|Aerospace|Arlington, VA|https://boeing.com
Lockheed Martin|Aerospace & Defense|Bethesda, MD|https://lockheedmartin.com
SpaceX|Aerospace|Hawthorne, CA|https://spacex.com
Rivian|Automotive|Irvine, CA|https://rivian.com
Ford|Automotive|Dearborn, MI|https://ford.com
General Motors|Automotive|Detroit, MI|https://gm.com
Toyota|Automotive|Toyota City, Japan|https://toyota.com
Volkswagen|Automotive|Wolfsburg, Germany|https://volkswagen.com
BMW|Automotive|Munich, Germany|https://bmw.com
Mercedes-Benz|Automotive|Stuttgart, Germany|https://mercedes-benz.com
Nike|Apparel|Beaverton, OR|https://nike.com
Adidas|Apparel|Herzogenaurach, Germany|https://adidas.com
Starbucks|Food & Beverage|Seattle, WA|https://starbucks.com
McDonald's|Food & Beverage|Chicago, IL|https://mcdonalds.com
Coca-Cola|Food & Beverage|Atlanta, GA|https://coca-colacompany.com
PepsiCo|Food & Beverage|Purchase, NY|https://pepsico.com
Unilever|Consumer Goods|London, UK|https://unilever.com
Procter & Gamble|Consumer Goods|Cincinnati, OH|https://pg.com
Nestlé|Consumer Goods|Vevey, Switzerland|https://nestle.com
Disney|Entertainment|Burbank, CA|https://thewaltdisneycompany.com
Warner Bros. Discovery|Entertainment|New York, NY|https://wbd.com
Paramount|Entertainment|New York, NY|https://paramount.com
Comcast|Telecom & Media|Philadelphia, PA|https://corporate.comcast.com
AT&T|Telecom|Dallas, TX|https://att.com
Verizon|Telecom|New York, NY|https://verizon.com
T-Mobile|Telecom|Bellevue, WA|https://t-mobile.com
Vodafone|Telecom|Newbury, UK|https://vodafone.com
Ericsson|Telecom|Stockholm, Sweden|https://ericsson.com
Nokia|Telecom|Espoo, Finland|https://nokia.com
FedEx|Logistics|Memphis, TN|https://fedex.com
UPS|Logistics|Atlanta, GA|https://ups.com
DHL|Logistics|Bonn, Germany|https://dhl.com
Maersk|Logistics|Copenhagen, Denmark|https://maersk.com
Booking.com|Travel|Amsterdam, Netherlands|https://booking.com
Expedia|Travel|Seattle, WA|https://expedia.com
MakeMyTrip|Travel|Gurugram, India|https://makemytrip.com
Delta Air Lines|Airlines|Atlanta, GA|https://delta.com
United Airlines|Airlines|Chicago, IL|https://united.com
Emirates|Airlines|Dubai, UAE|https://emirates.com
Zillow|Real Estate|Seattle, WA|https://zillow.com
Redfin|Real Estate|Seattle, WA|https://redfin.com
Opendoor|Real Estate|San Francisco, CA|https://opendoor.com
Compass|Real Estate|New York, NY|https://compass.com
WeWork|Real Estate|New York, NY|https://wework.com
Peloton|Fitness|New York, NY|https://onepeloton.com
Oracle Cerner|Healthcare Technology|Kansas City, MO|https://oracle.com/health
Yahoo|Internet|Sunnyvale, CA|https://yahoo.com
Intel Mobileye|Automotive Technology|Jerusalem, Israel|https://mobileye.com
Waymo|Autonomous Vehicles|Mountain View, CA|https://waymo.com
Cruise|Autonomous Vehicles|San Francisco, CA|https://getcruise.com
Lucid Motors|Automotive|Newark, CA|https://lucidmotors.com
Plaid|Fintech|San Francisco, CA|https://plaid.com
Affirm|Fintech|San Francisco, CA|https://affirm.com
Chime|Fintech|San Francisco, CA|https://chime.com
Klarna|Fintech|Stockholm, Sweden|https://klarna.com
Revolut|Fintech|London, UK|https://revolut.com
Wise|Fintech|London, UK|https://wise.com
Monzo|Fintech|London, UK|https://monzo.com
N26|Fintech|Berlin, Germany|https://n26.com
Delivery Hero|Delivery|Berlin, Germany|https://deliveryhero.com
Deliveroo|Delivery|London, UK|https://deliveroo.com
Grab|Mobility|Singapore|https://grab.com
Sea Limited|Technology|Singapore|https://sea.com
Gojek|Mobility|Jakarta, Indonesia|https://gojek.com
Tokopedia|E-commerce|Jakarta, Indonesia|https://tokopedia.com
Lazada|E-commerce|Singapore|https://lazada.com
Coupang|E-commerce|Seoul, South Korea|https://coupang.com
Naver|Internet|Seongnam, South Korea|https://navercorp.com
Kakao|Internet|Jeju, South Korea|https://kakaocorp.com
"""

def q(v):
    return "'" + v.replace("'", "''") + "'"

rows = []
seen = set()
for line in DATA.strip().splitlines():
    name, industry, hq, site = [p.strip() for p in line.split("|")]
    if name.lower() in seen:
        continue
    seen.add(name.lower())
    rows.append(f"  (gen_random_uuid(), {q(name)}, {q(industry)}, {q(hq)}, {q(site)})")

out = (
    "-- Seed a starter list of well-known employers (generated by scripts/generate-companies.py).\n"
    "-- Company names are unique case-insensitively, so existing or member-added companies are left alone.\n"
    "INSERT INTO companies (id, company_name, industry_name, headquarters_location, website_url) VALUES\n"
    + ",\n".join(rows)
    + "\nON CONFLICT (lower(company_name)) DO NOTHING;\n"
)
path = os.path.join(os.path.dirname(__file__), "..", "migrations", "009_seed_companies.sql")
open(path, "w", encoding="utf-8").write(out)
print(f"wrote {len(rows)} companies")
