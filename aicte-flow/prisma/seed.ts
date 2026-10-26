import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";
import {
  ROUTES,
  STAGES,
  APP_TYPE_ROUTE_MAP,
  ALERT_RULES,
  EVC_NEW_INSTITUTION_DAYS,
  RESPONSE_WINDOW_DAYS,
} from "../src/config/rules";
import { buildMetrics } from "../src/lib/aph";
import { differenceInCalendarDays } from "date-fns";

const prisma = new PrismaClient();

// Seeded PRNG for reproducibility
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const DEMO_TODAY = new Date("2026-10-23T00:00:00.000Z");
const daysAgo = (d: number) => new Date(DEMO_TODAY.getTime() - d * 86400000);
const daysFromNow = (d: number) => new Date(DEMO_TODAY.getTime() + d * 86400000);

async function hashAudit(prevHash: string, ts: Date, actorId: string, action: string, entityType: string, entityId: string, payload: string) {
  return createHash("sha256")
    .update(prevHash + ts.toISOString() + actorId + action + entityType + entityId + payload)
    .digest("hex");
}

async function appendAudit(
  prismaClient: PrismaClient,
  params: { actorId?: string; actorRole?: string; action: string; entityType: string; entityId: string; payload: object }
) {
  const last = await prismaClient.auditLog.findFirst({ orderBy: { seq: "desc" }, select: { hash: true } });
  const prevHash = last?.hash ?? "0".repeat(64);
  const ts = new Date();
  const hash = await hashAudit(prevHash, ts, params.actorId ?? "", params.action, params.entityType, params.entityId, JSON.stringify(params.payload));
  await prismaClient.auditLog.create({
    data: {
      ts,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      payload: JSON.stringify(params.payload),
      prevHash,
      hash,
    },
  });
}

const REGIONS = [
  { name: "Central", headquarters: "Bhopal" },
  { name: "Eastern", headquarters: "Kolkata" },
  { name: "North-Eastern", headquarters: "Guwahati" },
  { name: "Northern", headquarters: "New Delhi" },
  { name: "South-Central", headquarters: "Hyderabad" },
  { name: "South-Western", headquarters: "Bengaluru" },
  { name: "Southern", headquarters: "Chennai" },
  { name: "Western", headquarters: "Mumbai" },
];

interface RealInstData {
  aicteId: string;
  name: string;
  type: string;
  state: string;
  contactEmail: string;
  contactPhone: string;
  principalName: string;
  loginSlug: string;
}

const REAL_INSTITUTIONS_BY_REGION: Record<string, RealInstData[]> = {
  Central: [
    {
      aicteId: "1-29103847",
      name: "Shri Govindram Seksaria Institute of Technology and Science (SGSITS)",
      type: "ENGINEERING",
      state: "Madhya Pradesh",
      contactEmail: "director@sgsits.ac.in",
      contactPhone: "+91-7312582100",
      principalName: "Dr. Rakesh Saxena",
      loginSlug: "sgsits",
    },
    {
      aicteId: "1-30103848",
      name: "Jabalpur Engineering College (JEC)",
      type: "ENGINEERING",
      state: "Madhya Pradesh",
      contactEmail: "principal@jecjabalpur.ac.in",
      contactPhone: "+91-7612331953",
      principalName: "Dr. P. K. Jhinge",
      loginSlug: "jec",
    },
    {
      aicteId: "1-41103859",
      name: "Institute of Engineering & Technology, DAVV (IET-DAVV)",
      type: "ENGINEERING",
      state: "Madhya Pradesh",
      contactEmail: "director@ietdavv.edu.in",
      contactPhone: "+91-7312361116",
      principalName: "Dr. Sanjiv Tokekar",
      loginSlug: "ietdavv",
    },
    {
      aicteId: "1-52103860",
      name: "Bhilai Institute of Technology (BIT Durg)",
      type: "ENGINEERING",
      state: "Chhattisgarh",
      contactEmail: "bit@bitdurg.ac.in",
      contactPhone: "+91-7882359297",
      principalName: "Dr. Arun Arora",
      loginSlug: "bitdurg",
    },
    {
      aicteId: "1-63103861",
      name: "B.R. Nahata College of Pharmacy",
      type: "PHARMACY",
      state: "Madhya Pradesh",
      contactEmail: "principal@brnahata.ac.in",
      contactPhone: "+91-7422255555",
      principalName: "Dr. Amit K. Jain",
      loginSlug: "brnahata",
    },
    {
      aicteId: "1-74103862",
      name: "Department of Architecture & Planning, MANIT Bhopal",
      type: "ARCH",
      state: "Madhya Pradesh",
      contactEmail: "arch@manit.ac.in",
      contactPhone: "+91-7554051000",
      principalName: "Prof. Savita Raje",
      loginSlug: "manitarch",
    },
    {
      aicteId: "1-85103863",
      name: "Prestige Institute of Management and Research (PIMR)",
      type: "MANAGEMENT",
      state: "Madhya Pradesh",
      contactEmail: "director@pimrindore.ac.in",
      contactPhone: "+91-7314012222",
      principalName: "Dr. Debasis Mallik",
      loginSlug: "pimr",
    },
    {
      aicteId: "1-96103864",
      name: "Rungta College of Engineering and Technology",
      type: "ENGINEERING",
      state: "Chhattisgarh",
      contactEmail: "info@rungta.ac.in",
      contactPhone: "+91-7886666666",
      principalName: "Dr. Sourabh Rungta",
      loginSlug: "rungta",
    },
  ],
  Eastern: [
    {
      aicteId: "1-31029481",
      name: "Faculty of Engineering & Technology, Jadavpur University",
      type: "ENGINEERING",
      state: "West Bengal",
      contactEmail: "dean.fet@jadavpuruniversity.in",
      contactPhone: "+91-3324146666",
      principalName: "Prof. Chiranjib Bhattacharjee",
      loginSlug: "jadavpur",
    },
    {
      aicteId: "1-32093841",
      name: "Heritage Institute of Technology",
      type: "ENGINEERING",
      state: "West Bengal",
      contactEmail: "admin@heritageit.edu",
      contactPhone: "+91-3366270600",
      principalName: "Dr. Basab Chaudhuri",
      loginSlug: "heritage",
    },
    {
      aicteId: "1-10293855",
      name: "Birla Institute of Technology (BIT) Mesra",
      type: "ENGINEERING",
      state: "Jharkhand",
      contactEmail: "registrar@bitmesra.ac.in",
      contactPhone: "+91-6512275444",
      principalName: "Dr. Indranil Manna",
      loginSlug: "bitmesra",
    },
    {
      aicteId: "1-43094852",
      name: "Odisha University of Technology and Research (OUTR Bhubaneswar)",
      type: "ENGINEERING",
      state: "Odisha",
      contactEmail: "registrar@outr.ac.in",
      contactPhone: "+91-6742386075",
      principalName: "Prof. Bibhuti Bhusan Biswal",
      loginSlug: "outr",
    },
    {
      aicteId: "1-54094863",
      name: "Calcutta Institute of Pharmaceutical Technology",
      type: "PHARMACY",
      state: "West Bengal",
      contactEmail: "info@cipt.ac.in",
      contactPhone: "+91-3214227000",
      principalName: "Dr. Tapan Kumar Maity",
      loginSlug: "cipt",
    },
    {
      aicteId: "1-65094874",
      name: "Government College of Engineering and Leather Technology",
      type: "ENGINEERING",
      state: "West Bengal",
      contactEmail: "principal@gcelt.gov.in",
      contactPhone: "+91-3323358356",
      principalName: "Dr. Saikat Maitra",
      loginSlug: "gcelt",
    },
    {
      aicteId: "1-76094885",
      name: "Xavier Institute of Social Service (XISS Ranchi)",
      type: "MANAGEMENT",
      state: "Jharkhand",
      contactEmail: "director@xiss.ac.in",
      contactPhone: "+91-6512200873",
      principalName: "Dr. Joseph Marianus Kujur",
      loginSlug: "xiss",
    },
    {
      aicteId: "1-87094896",
      name: "Veer Surendra Sai University of Technology (VSSUT Burla)",
      type: "ENGINEERING",
      state: "Odisha",
      contactEmail: "registrar@vssut.ac.in",
      contactPhone: "+91-6632430211",
      principalName: "Prof. Banshidhar Majhi",
      loginSlug: "vssut",
    },
  ],
  "North-Eastern": [
    {
      aicteId: "1-20193847",
      name: "Assam Engineering College (AEC)",
      type: "ENGINEERING",
      state: "Assam",
      contactEmail: "principal@aec.ac.in",
      contactPhone: "+91-3612570550",
      principalName: "Dr. Atul Bora",
      loginSlug: "aec",
    },
    {
      aicteId: "1-21029384",
      name: "Jorhat Engineering College (JEC)",
      type: "ENGINEERING",
      state: "Assam",
      contactEmail: "principal@jecassam.ac.in",
      contactPhone: "+91-3762330134",
      principalName: "Dr. Reeta Sarmah",
      loginSlug: "jecassam",
    },
    {
      aicteId: "1-22029385",
      name: "Girijananda Chowdhury Institute of Pharmaceutical Science (GIPS)",
      type: "PHARMACY",
      state: "Assam",
      contactEmail: "principal@gips-guwahati.ac.in",
      contactPhone: "+91-3612843405",
      principalName: "Dr. Gouranga Das",
      loginSlug: "gips",
    },
    {
      aicteId: "1-23029386",
      name: "North Eastern Regional Institute of Science and Technology (NERIST)",
      type: "ENGINEERING",
      state: "Arunachal Pradesh",
      contactEmail: "director@nerist.ac.in",
      contactPhone: "+91-360257401",
      principalName: "Prof. Narendranath S.",
      loginSlug: "nerist",
    },
    {
      aicteId: "1-24029387",
      name: "National Institute of Technology Nagaland",
      type: "ENGINEERING",
      state: "Nagaland",
      contactEmail: "director@nitnagaland.ac.in",
      contactPhone: "+91-3862241800",
      principalName: "Prof. S. Venugopal",
      loginSlug: "nitnagaland",
    },
    {
      aicteId: "1-25029388",
      name: "Shillong Engineering & Management College",
      type: "MANAGEMENT",
      state: "Meghalaya",
      contactEmail: "principal@semc.edu.in",
      contactPhone: "+91-3642590123",
      principalName: "Dr. D. K. Kharkongor",
      loginSlug: "semc",
    },
    {
      aicteId: "1-26029389",
      name: "Manipur Institute of Technology (MIT Imphal)",
      type: "ENGINEERING",
      state: "Manipur",
      contactEmail: "mit_imphal@manipuruniv.ac.in",
      contactPhone: "+91-3852435055",
      principalName: "Dr. Th. Kulachandra Singh",
      loginSlug: "mitimphal",
    },
    {
      aicteId: "1-27029390",
      name: "Tripura Institute of Technology (TIT Narsingarh)",
      type: "ENGINEERING",
      state: "Tripura",
      contactEmail: "principal@titagartala.ac.in",
      contactPhone: "+91-3812341234",
      principalName: "Dr. Bijoy Kumar Upadhyaya",
      loginSlug: "titagartala",
    },
  ],
  Northern: [
    {
      aicteId: "1-33290141",
      name: "Delhi Technological University (DTU)",
      type: "ENGINEERING",
      state: "Delhi",
      contactEmail: "contact@dtu.ac.in",
      contactPhone: "+91-1127871018",
      principalName: "Prof. Prateek Sharma",
      loginSlug: "dtu",
    },
    {
      aicteId: "1-45678912",
      name: "Harcourt Butler Technical University (HBTU Kanpur)",
      type: "ENGINEERING",
      state: "Uttar Pradesh",
      contactEmail: "registrar@hbtu.ac.in",
      contactPhone: "+91-5122534001",
      principalName: "Prof. Samsher",
      loginSlug: "hbtu",
    },
    {
      aicteId: "1-10293847",
      name: "Thapar Institute of Engineering and Technology",
      type: "ENGINEERING",
      state: "Punjab",
      contactEmail: "admissions@thapar.edu",
      contactPhone: "+91-1752393021",
      principalName: "Dr. Prakash Gopalan",
      loginSlug: "thapar",
    },
    {
      aicteId: "1-55829102",
      name: "Jamia Hamdard Faculty of Pharmacy",
      type: "PHARMACY",
      state: "Delhi",
      contactEmail: "inquiry@jamiahamdard.ac.in",
      contactPhone: "+91-1126059688",
      principalName: "Prof. Farhan Jalees Ahmad",
      loginSlug: "jamiahamdard",
    },
    {
      aicteId: "1-67892104",
      name: "National Institute of Technology Kurukshetra",
      type: "ENGINEERING",
      state: "Haryana",
      contactEmail: "registrar@nitkkr.ac.in",
      contactPhone: "+91-1744233208",
      principalName: "Prof. B. V. Ramana Reddy",
      loginSlug: "nitkkr",
    },
    {
      aicteId: "1-78901234",
      name: "Sushant School of Art and Architecture",
      type: "ARCH",
      state: "Haryana",
      contactEmail: "dean.arch@ansaluniversity.edu.in",
      contactPhone: "+91-1244750400",
      principalName: "Prof. Vibhuti Sachdev",
      loginSlug: "sushantarch",
    },
    {
      aicteId: "1-89012345",
      name: "University School of Management Studies (GGSIPU)",
      type: "MANAGEMENT",
      state: "Delhi",
      contactEmail: "dean.usms@ipu.ac.in",
      contactPhone: "+91-1125302111",
      principalName: "Prof. A. K. Saini",
      loginSlug: "ggsipu",
    },
    {
      aicteId: "1-90123456",
      name: "Institute of Engineering and Technology (IET Lucknow)",
      type: "ENGINEERING",
      state: "Uttar Pradesh",
      contactEmail: "director@ietlucknow.ac.in",
      contactPhone: "+91-5222733696",
      principalName: "Prof. Vineet Kansal",
      loginSlug: "ietlucknow",
    },
  ],
  "South-Central": [
    {
      aicteId: "1-46102938",
      name: "JNTUH University College of Engineering Hyderabad",
      type: "ENGINEERING",
      state: "Telangana",
      contactEmail: "uceh@jntuh.ac.in",
      contactPhone: "+91-4023158661",
      principalName: "Dr. A. Govardhan",
      loginSlug: "jntuh",
    },
    {
      aicteId: "1-45192038",
      name: "University College of Engineering, Osmania University",
      type: "ENGINEERING",
      state: "Telangana",
      contactEmail: "principal@uceou.edu",
      contactPhone: "+91-4027098254",
      principalName: "Prof. S. Ramachandram",
      loginSlug: "osmania",
    },
    {
      aicteId: "1-44102938",
      name: "Andhra University College of Engineering (AUCoE)",
      type: "ENGINEERING",
      state: "Andhra Pradesh",
      contactEmail: "principal.aucoe@andhrauniversity.edu.in",
      contactPhone: "+91-8912844999",
      principalName: "Prof. P. Mallikarjuna Rao",
      loginSlug: "aucoe",
    },
    {
      aicteId: "1-56102949",
      name: "Chaitanya Bharathi Institute of Technology (CBIT)",
      type: "ENGINEERING",
      state: "Telangana",
      contactEmail: "principal@cbit.ac.in",
      contactPhone: "+91-4024193276",
      principalName: "Dr. C. V. Narasimhulu",
      loginSlug: "cbit",
    },
    {
      aicteId: "1-67102950",
      name: "Sultan-Ul-Uloom College of Pharmacy",
      type: "PHARMACY",
      state: "Telangana",
      contactEmail: "sucp@sultanululoom.ac.in",
      contactPhone: "+91-4023356084",
      principalName: "Dr. Anupama Koneru",
      loginSlug: "sucp",
    },
    {
      aicteId: "1-78102951",
      name: "School of Planning and Architecture (SPA Vijayawada)",
      type: "ARCH",
      state: "Andhra Pradesh",
      contactEmail: "registrar@spav.ac.in",
      contactPhone: "+91-8662469446",
      principalName: "Prof. Ramesh Srikonda",
      loginSlug: "spav",
    },
    {
      aicteId: "1-89102952",
      name: "Institute of Public Enterprise (IPE Hyderabad)",
      type: "MANAGEMENT",
      state: "Telangana",
      contactEmail: "admissions@ipeindia.org",
      contactPhone: "+91-4023490900",
      principalName: "Dr. S. S. Murthy",
      loginSlug: "ipe",
    },
    {
      aicteId: "1-90102953",
      name: "GMR Institute of Technology (GMRIT)",
      type: "ENGINEERING",
      state: "Andhra Pradesh",
      contactEmail: "gmrit@gmrit.edu.in",
      contactPhone: "+91-8941251592",
      principalName: "Dr. C. L. V. R. S. V. Prasad",
      loginSlug: "gmrit",
    },
  ],
  "South-Western": [
    {
      aicteId: "1-48201934",
      name: "R.V. College of Engineering (RVCE)",
      type: "ENGINEERING",
      state: "Karnataka",
      contactEmail: "principal@rvce.edu.in",
      contactPhone: "+91-8068188111",
      principalName: "Dr. K. N. Subramanya",
      loginSlug: "rvce",
    },
    {
      aicteId: "1-47291039",
      name: "BMS College of Engineering",
      type: "ENGINEERING",
      state: "Karnataka",
      contactEmail: "principal@bmsce.ac.in",
      contactPhone: "+91-8026622130",
      principalName: "Dr. S. Muralidhara",
      loginSlug: "bmsce",
    },
    {
      aicteId: "1-39102948",
      name: "College of Engineering Trivandrum (CET)",
      type: "ENGINEERING",
      state: "Kerala",
      contactEmail: "principal@cet.ac.in",
      contactPhone: "+91-4712598370",
      principalName: "Dr. V. Suresh Babu",
      loginSlug: "cet",
    },
    {
      aicteId: "1-51029384",
      name: "Government Engineering College, Thrissur",
      type: "ENGINEERING",
      state: "Kerala",
      contactEmail: "principal@gectcr.ac.in",
      contactPhone: "+91-4872334144",
      principalName: "Dr. Ranjini Bhattathiripad",
      loginSlug: "gectcr",
    },
    {
      aicteId: "1-62039485",
      name: "Manipal College of Pharmaceutical Sciences",
      type: "PHARMACY",
      state: "Karnataka",
      contactEmail: "mcops.mu@manipal.edu",
      contactPhone: "+91-8202922482",
      principalName: "Dr. C. Mallikarjuna Rao",
      loginSlug: "mcops",
    },
    {
      aicteId: "1-73049586",
      name: "University Visvesvaraya College of Engineering (UVCE)",
      type: "ENGINEERING",
      state: "Karnataka",
      contactEmail: "principal@uvce.ac.in",
      contactPhone: "+91-8022961811",
      principalName: "Dr. H. N. Ramesh",
      loginSlug: "uvce",
    },
    {
      aicteId: "1-84059697",
      name: "BMS College of Architecture",
      type: "ARCH",
      state: "Karnataka",
      contactEmail: "office@bmsca.org",
      contactPhone: "+91-8026622129",
      principalName: "Prof. Mamatha P. Raj",
      loginSlug: "bmsca",
    },
    {
      aicteId: "1-95069708",
      name: "TKM College of Engineering (TKMCE)",
      type: "ENGINEERING",
      state: "Kerala",
      contactEmail: "principal@tkmce.ac.in",
      contactPhone: "+91-4742712022",
      principalName: "Dr. Shahul Hameed",
      loginSlug: "tkmce",
    },
  ],
  Southern: [
    {
      aicteId: "1-12398401",
      name: "College of Engineering, Guindy (Anna University)",
      type: "ENGINEERING",
      state: "Tamil Nadu",
      contactEmail: "dean@ceg.annauniv.edu",
      contactPhone: "+91-4422358491",
      principalName: "Dr. K. Suganthi",
      loginSlug: "ceg",
    },
    {
      aicteId: "1-14029384",
      name: "PSG College of Technology",
      type: "ENGINEERING",
      state: "Tamil Nadu",
      contactEmail: "principal@psgtech.edu",
      contactPhone: "+91-4222572177",
      principalName: "Dr. K. Prakasan",
      loginSlug: "psgtech",
    },
    {
      aicteId: "1-15093842",
      name: "Thiagarajar College of Engineering",
      type: "ENGINEERING",
      state: "Tamil Nadu",
      contactEmail: "principal@tce.edu",
      contactPhone: "+91-4522482240",
      principalName: "Dr. M. Palaninatha Raja",
      loginSlug: "tce",
    },
    {
      aicteId: "1-16029384",
      name: "Madras Medical College College of Pharmacy",
      type: "PHARMACY",
      state: "Tamil Nadu",
      contactEmail: "pharmacy@mmc.tn.gov.in",
      contactPhone: "+91-4425305000",
      principalName: "Dr. Jerad Suresh",
      loginSlug: "mmcpharm",
    },
    {
      aicteId: "1-17029384",
      name: "School of Architecture and Planning (SAP Anna University)",
      type: "ARCH",
      state: "Tamil Nadu",
      contactEmail: "deansap@annauniv.edu",
      contactPhone: "+91-4422359291",
      principalName: "Dr. K. R. Sitalakshmi",
      loginSlug: "sapanna",
    },
    {
      aicteId: "1-18029384",
      name: "Department of Management Studies (DOMS Anna University)",
      type: "MANAGEMENT",
      state: "Tamil Nadu",
      contactEmail: "doms@annauniv.edu",
      contactPhone: "+91-4422358872",
      principalName: "Dr. Hansa Lysander Manohar",
      loginSlug: "domsanna",
    },
    {
      aicteId: "1-19029384",
      name: "Pondicherry Technological University (formerly PEC)",
      type: "ENGINEERING",
      state: "Puducherry",
      contactEmail: "principal@pec.edu",
      contactPhone: "+91-4132655281",
      principalName: "Dr. S. Mohan",
      loginSlug: "ptu",
    },
    {
      aicteId: "1-20029384",
      name: "Coimbatore Institute of Technology (CIT)",
      type: "ENGINEERING",
      state: "Tamil Nadu",
      contactEmail: "info@cit.edu.in",
      contactPhone: "+91-4222574071",
      principalName: "Dr. A. Rajeswari",
      loginSlug: "cit",
    },
  ],
  Western: [
    {
      aicteId: "1-42938111",
      name: "COEP Technological University (formerly College of Engineering Pune)",
      type: "ENGINEERING",
      state: "Maharashtra",
      contactEmail: "director@coeptech.ac.in",
      contactPhone: "+91-2025507000",
      principalName: "Dr. Sunil Bhirud",
      loginSlug: "coep",
    },
    {
      aicteId: "1-28734910",
      name: "Veermata Jijabai Technological Institute (VJTI Mumbai)",
      type: "ENGINEERING",
      state: "Maharashtra",
      contactEmail: "director@vjti.ac.in",
      contactPhone: "+91-2224198101",
      principalName: "Dr. Sachin Kore",
      loginSlug: "vjti",
    },
    {
      aicteId: "1-39820194",
      name: "Institute of Chemical Technology (ICT Mumbai)",
      type: "ENGINEERING",
      state: "Maharashtra",
      contactEmail: "registrar@ictmumbai.edu.in",
      contactPhone: "+91-2233611111",
      principalName: "Prof. Aniruddha B. Pandit",
      loginSlug: "ictmumbai",
    },
    {
      aicteId: "1-50293819",
      name: "L.D. College of Engineering",
      type: "ENGINEERING",
      state: "Gujarat",
      contactEmail: "principal@ldce.ac.in",
      contactPhone: "+91-7926306752",
      principalName: "Dr. Rajul K. Gajjar",
      loginSlug: "ldce",
    },
    {
      aicteId: "1-61029384",
      name: "Bombay College of Pharmacy",
      type: "PHARMACY",
      state: "Maharashtra",
      contactEmail: "office@bcp.edu.in",
      contactPhone: "+91-2226670871",
      principalName: "Dr. Krishnapriya Mohanraj",
      loginSlug: "bcp",
    },
    {
      aicteId: "1-72938401",
      name: "Sir J.J. College of Architecture",
      type: "ARCH",
      state: "Maharashtra",
      contactEmail: "admin@sirjjarchitecture.org",
      contactPhone: "+91-2222621649",
      principalName: "Prof. Rajiv Mishra",
      loginSlug: "sirjjarch",
    },
    {
      aicteId: "1-83029485",
      name: "B.K. School of Professional and Management Studies",
      type: "MANAGEMENT",
      state: "Gujarat",
      contactEmail: "info@bkschool.org",
      contactPhone: "+91-7926304811",
      principalName: "Dr. Prateek Kanchan",
      loginSlug: "bkschool",
    },
    {
      aicteId: "1-94039281",
      name: "Sardar Patel Institute of Technology (SPIT)",
      type: "ENGINEERING",
      state: "Maharashtra",
      contactEmail: "principal@spit.ac.in",
      contactPhone: "+91-2226707440",
      principalName: "Dr. Bhalchandra Chaudhari",
      loginSlug: "spit",
    },
  ],
};

async function main() {
  console.log("🌱 Starting seed...");

  // Clean up
  await prisma.escalationEvent.deleteMany();
  await prisma.alertLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deadlineItem.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.instDocument.deleteMany();
  await prisma.undertaking.deleteMany();
  await prisma.evcVisit.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.applicationStage.deleteMany();
  await prisma.application.deleteMany();
  await prisma.ruleConfig.deleteMany();
  await prisma.systemClock.deleteMany();
  await prisma.user.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.region.deleteMany();

  // SystemClock
  await prisma.systemClock.create({ data: { id: 1, simulatedNow: null } });

  // RuleConfig
  await prisma.ruleConfig.createMany({
    data: [
      { key: "STAGES", value: JSON.stringify(STAGES) },
      { key: "ROUTES", value: JSON.stringify(ROUTES) },
      { key: "APP_TYPE_ROUTE_MAP", value: JSON.stringify(APP_TYPE_ROUTE_MAP) },
      { key: "ALERT_RULES", value: JSON.stringify(ALERT_RULES) },
      { key: "EVC_NEW_INSTITUTION_DAYS", value: JSON.stringify(EVC_NEW_INSTITUTION_DAYS) },
      { key: "RESPONSE_WINDOW_DAYS", value: JSON.stringify(RESPONSE_WINDOW_DAYS) },
    ],
  });

  // Regions
  console.log("📍 Creating regions...");
  const regions: { id: string; name: string }[] = [];
  for (const r of REGIONS) {
    const region = await prisma.region.create({ data: r });
    regions.push({ id: region.id, name: region.name });
  }

  // Institutions from Official AICTE Public Directory
  console.log("🏫 Creating 64 accredited institutions across all 8 AICTE regions...");
  const institutions: {
    id: string;
    regionId: string;
    name: string;
    principalName: string;
    loginSlug: string;
  }[] = [];

  for (const region of regions) {
    const list = REAL_INSTITUTIONS_BY_REGION[region.name] ?? [];
    for (const item of list) {
      const inst = await prisma.institution.create({
        data: {
          aicteId: item.aicteId,
          name: item.name,
          type: item.type,
          state: item.state,
          regionId: region.id,
          contactEmail: item.contactEmail,
          contactPhone: item.contactPhone,
        },
      });
      institutions.push({
        id: inst.id,
        regionId: region.id,
        name: inst.name,
        principalName: item.principalName,
        loginSlug: item.loginSlug,
      });
    }
  }

  // Users
  console.log("👤 Creating users...");
  const usersByRegion: Record<string, string[]> = {};
  const bureauOfficers: string[] = [];
  const evcMembers: string[] = [];
  let sacMemberId = "";
  let adminId = "";
  const institutionUsers: { userId: string; institutionId: string }[] = [];
  const allRegionalOfficers: { id: string; regionId: string }[] = [];

  for (const region of regions) {
    const slug = region.name.toLowerCase().replace(/[^a-z]/g, "");
    usersByRegion[region.id] = [];

    // 2 Regional Officers (second is senior, escalates to Bureau Officer)
    const ro1 = await prisma.user.create({
      data: {
        name: `RO ${region.name} Alpha`,
        email: `ro.${slug}.alpha@demo.aicte`,
        role: "REGIONAL_OFFICER",
        regionId: region.id,
        designation: "Regional Officer",
      },
    });
    const ro2 = await prisma.user.create({
      data: {
        name: `RO ${region.name} Beta (Senior)`,
        email: `ro.${slug}.beta@demo.aicte`,
        role: "REGIONAL_OFFICER",
        regionId: region.id,
        designation: "Senior Regional Officer",
      },
    });
    usersByRegion[region.id].push(ro1.id, ro2.id);
    allRegionalOfficers.push({ id: ro1.id, regionId: region.id }, { id: ro2.id, regionId: region.id });
  }

  // 2 Bureau Officers
  const bo1 = await prisma.user.create({
    data: { name: "Bureau Officer Alpha", email: "bo.alpha@demo.aicte", role: "BUREAU_OFFICER", designation: "Bureau Officer" },
  });
  const bo2 = await prisma.user.create({
    data: { name: "Bureau Officer Beta", email: "bo.beta@demo.aicte", role: "BUREAU_OFFICER", designation: "Senior Bureau Officer" },
  });
  bureauOfficers.push(bo1.id, bo2.id);

  // Set escalatesTo for regional officers → bureau officer
  for (const ro of allRegionalOfficers) {
    await prisma.user.update({ where: { id: ro.id }, data: { escalatesToId: bo1.id } });
  }

  // 3 EVC Committee members
  for (let i = 1; i <= 3; i++) {
    const evc = await prisma.user.create({
      data: { name: `EVC Member ${i}`, email: `evc.member${i}@demo.aicte`, role: "EVC_COMMITTEE", designation: "EVC Committee Member" },
    });
    evcMembers.push(evc.id);
  }

  // 1 SAC/SHC Member
  const sac = await prisma.user.create({
    data: { name: "SAC/SHC Member", email: "sac.member@demo.aicte", role: "SAC_SHC_MEMBER", designation: "SAC Member" },
  });
  sacMemberId = sac.id;

  // 1 Admin
  const admin = await prisma.user.create({
    data: { name: "System Admin", email: "admin@demo.aicte", role: "ADMIN", designation: "System Administrator" },
  });
  adminId = admin.id;

  // Institution users (covering prominent institutions across regions)
  for (let i = 0; i < Math.min(16, institutions.length); i++) {
    const inst = institutions[i];
    const user = await prisma.user.create({
      data: {
        name: `${inst.name} (${inst.principalName})`,
        email: `inst.${inst.loginSlug}@demo.aicte`,
        role: "INSTITUTION",
        institutionId: inst.id,
        regionId: inst.regionId,
        designation: "Principal / Director",
      },
    });
    institutionUsers.push({ userId: user.id, institutionId: inst.id });
  }

  // Applications
  console.log("📋 Creating ~200 applications...");
  const appTypes = ["NEW_INSTITUTION", "NEW_COURSE", "EXTENSION", "INTAKE_INCREASE", "CLOSURE", "OTHER"];
  const routeKeys = Object.keys(ROUTES) as (keyof typeof ROUTES)[];
  const allStageKeys = Object.keys(STAGES);
  const applications: string[] = [];
  let appCounter = 1;

  // Helper: create application with all stages/deadlines
  async function createApp(opts: {
    refNo: string;
    institutionId: string;
    regionId: string;
    applicationType: string;
    route: keyof typeof ROUTES;
    currentStageKey: string;
    status: string;
    submittedDaysAgo: number;
    stageEnteredDaysAgo: number;
    assignedToId?: string;
    isDemo?: boolean;
    metricsCompliant?: boolean;
    intake?: number;
    withReturnHistory?: boolean;
  }) {
    const submittedAt = daysAgo(opts.submittedDaysAgo);
    const stageEnteredAt = daysAgo(opts.stageEnteredDaysAgo);
    const metrics = buildMetrics(opts.intake ?? 60, opts.metricsCompliant !== false);

    const app = await prisma.application.create({
      data: {
        refNo: opts.refNo,
        institutionId: opts.institutionId,
        regionId: opts.regionId,
        applicationType: opts.applicationType,
        route: opts.route,
        currentStageKey: opts.currentStageKey,
        status: opts.status as "IN_PROGRESS" | "RETURNED" | "COMPLETED" | "DECIDED",
        assignedToId: opts.assignedToId,
        metricsJson: JSON.stringify(metrics),
        submittedAt,
        stageEnteredAt,
        ...(opts.status === "DECIDED"
          ? {
              decision: "APPROVED",
              decisionRemarks: "Seeded competent-authority approval for demo / reports.",
              decidedAt: DEMO_TODAY,
              decidedById: opts.assignedToId,
            }
          : {}),
      },
    });

    // Seed stage history for dual-clock / timeline demos
    const routeStages: string[] = [...ROUTES[opts.route]];
    const currentIdx = Math.max(0, routeStages.indexOf(opts.currentStageKey));
    let cursor = new Date(submittedAt);
    for (let i = 0; i < currentIdx; i++) {
      const entered = new Date(cursor);
      const exited = new Date(entered.getTime() + (3 + (i % 3)) * 86400000);
      await prisma.applicationStage.create({
        data: {
          applicationId: app.id,
          stageKey: routeStages[i],
          enteredAt: entered,
          exitedAt: exited,
          outcome: "ADVANCED",
          enteredById: opts.assignedToId,
        },
      });
      cursor = exited;
    }
    if (opts.withReturnHistory) {
      const entered = daysAgo(opts.stageEnteredDaysAgo + 10);
      const exited = daysAgo(opts.stageEnteredDaysAgo + 4);
      await prisma.applicationStage.create({
        data: {
          applicationId: app.id,
          stageKey: "SCRUTINY",
          enteredAt: entered,
          exitedAt: exited,
          outcome: "RETURNED",
          enteredById: opts.assignedToId,
          notes: "Deficiency return (seeded)",
        },
      });
      await prisma.applicationStage.create({
        data: {
          applicationId: app.id,
          stageKey: "RE_SCRUTINY",
          enteredAt: daysAgo(opts.stageEnteredDaysAgo + 1),
          exitedAt: null,
          enteredById: opts.assignedToId,
        },
      });
    } else {
      await prisma.applicationStage.create({
        data: {
          applicationId: app.id,
          stageKey: opts.currentStageKey,
          enteredAt: stageEnteredAt,
          exitedAt: opts.status === "COMPLETED" || opts.status === "DECIDED" ? DEMO_TODAY : null,
          outcome: opts.status === "COMPLETED" || opts.status === "DECIDED" ? "COMPLETED" : null,
          enteredById: opts.assignedToId,
        },
      });
    }

    // Stage timeline deadline
    const stageTimeline = STAGES[opts.currentStageKey]?.timelineDays ?? 10;
    const dueAt = new Date(stageEnteredAt.getTime() + stageTimeline * 86400000);
    const daysToDue = differenceInCalendarDays(dueAt, DEMO_TODAY);

    let deadlineState: "OPEN" | "SATISFIED" | "CANCELLED" = "OPEN";
    if (opts.status === "COMPLETED" || opts.status === "DECIDED") deadlineState = "SATISFIED";

    let escalationLevel = 0;
    if (daysToDue < -10) escalationLevel = 3;
    else if (daysToDue < -5) escalationLevel = 2;
    else if (daysToDue < -1) escalationLevel = 1;

    await prisma.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: app.id,
        institutionId: opts.institutionId,
        regionId: opts.regionId,
        ownerUserId: opts.assignedToId,
        title: `${opts.refNo} – ${STAGES[opts.currentStageKey]?.label ?? opts.currentStageKey} deadline`,
        dueAt,
        state: deadlineState,
        escalationLevel,
        applicationId: app.id,
        closedAt: deadlineState !== "OPEN" ? DEMO_TODAY : null,
      },
    });

    await appendAudit(prisma, {
      actorId: adminId,
      actorRole: "ADMIN",
      action: "APPLICATION_CREATED",
      entityType: "Application",
      entityId: app.id,
      payload: { refNo: opts.refNo, applicationType: opts.applicationType, route: opts.route },
    });

    return app;
  }

  // DEMO golden applications
  const demoInst = institutions[0];
  const demoRegionROs = allRegionalOfficers.filter((r) => r.regionId === demoInst.regionId);

  // DEMO-NEW-INST-001: SCRUTINY_EVC_SAC_SHC route, currently at SCRUTINY
  const demoApp1 = await createApp({
    refNo: "DEMO-NEW-INST-001",
    institutionId: demoInst.id,
    regionId: demoInst.regionId,
    applicationType: "NEW_INSTITUTION",
    route: "SCRUTINY_EVC_SAC_SHC",
    currentStageKey: "RE_SCRUTINY",
    status: "IN_PROGRESS",
    submittedDaysAgo: 14,
    stageEnteredDaysAgo: 1,
    assignedToId: demoRegionROs[0]?.id,
    isDemo: true,
    metricsCompliant: false,
    intake: 120,
    withReturnHistory: true,
  });
  applications.push(demoApp1.id);

  // DEMO-NEW-COURSE-002: queued so the Regional Officer can schedule it
  const demoApp2 = await createApp({
    refNo: "DEMO-NEW-COURSE-002",
    institutionId: institutions[1].id,
    regionId: institutions[1].regionId,
    applicationType: "NEW_COURSE",
    route: "SCRUTINY_EVC",
    currentStageKey: "EVC_QUEUE",
    status: "IN_PROGRESS",
    submittedDaysAgo: 25,
    stageEnteredDaysAgo: 3,
    assignedToId: allRegionalOfficers.find((r) => r.regionId === institutions[1].regionId)?.id,
    isDemo: true,
  });
  applications.push(demoApp2.id);
  await prisma.evcVisit.create({
    data: {
      applicationId: demoApp2.id,
      status: "QUEUED",
      committeeId: null,
      isNewInstitution: false,
    },
  });

  // DEMO-EXTENSION-003: ONLY_SCRUTINY, DECISION_PENDING
  const demoApp3 = await createApp({
    refNo: "DEMO-EXTENSION-003",
    institutionId: institutions[2].id,
    regionId: institutions[2].regionId,
    applicationType: "EXTENSION",
    route: "ONLY_SCRUTINY",
    currentStageKey: "DECISION_PENDING",
    status: "IN_PROGRESS",
    submittedDaysAgo: 30,
    stageEnteredDaysAgo: 2,
    assignedToId: bureauOfficers[0],
    isDemo: true,
  });
  applications.push(demoApp3.id);

  // DEMO-INTAKE-004: SCRUTINY_EVC, RETURNED
  const demoApp4 = await createApp({
    refNo: "DEMO-INTAKE-004",
    institutionId: institutions[0].id,
    regionId: institutions[0].regionId,
    applicationType: "INTAKE_INCREASE",
    route: "SCRUTINY_EVC",
    currentStageKey: "SCRUTINY",
    status: "RETURNED",
    submittedDaysAgo: 20,
    stageEnteredDaysAgo: 15,
    assignedToId: demoRegionROs[0]?.id,
    isDemo: true,
  });
  applications.push(demoApp4.id);

  // DEMO-EVC-SAC-005
  const demoApp5 = await createApp({
    refNo: "DEMO-EVC-SAC-005",
    institutionId: institutions[4].id,
    regionId: institutions[4].regionId,
    applicationType: "NEW_INSTITUTION",
    route: "EVC_SAC_SHC",
    currentStageKey: "SAC_SHC",
    status: "IN_PROGRESS",
    submittedDaysAgo: 60,
    stageEnteredDaysAgo: 4,
    assignedToId: sacMemberId,
    isDemo: true,
  });
  applications.push(demoApp5.id);

  // ~195 more applications
  for (let i = 6; i <= 200; i++) {
    const inst = pick(institutions);
    const ros = allRegionalOfficers.filter((r) => r.regionId === inst.regionId);
    const appType = pick(appTypes);
    const routeKey = (APP_TYPE_ROUTE_MAP[appType] as keyof typeof ROUTES) ?? "ONLY_SCRUTINY";
    const routeStages = ROUTES[routeKey];

    // Distribute across stages
    let stageIdx: number;
    const r = rand();
    if (r < 0.35) stageIdx = 0; // majority at first stage
    else if (r < 0.55) stageIdx = Math.min(1, routeStages.length - 1);
    else if (r < 0.70) stageIdx = Math.min(2, routeStages.length - 1);
    else if (r < 0.82) stageIdx = Math.min(3, routeStages.length - 1);
    else stageIdx = routeStages.length - 1;

    const currentStage = routeStages[stageIdx];

    // Determine SLA status: 65% green, 20% amber, 15% red
    const slaBucket = rand();
    const stageTimeline = STAGES[currentStage]?.timelineDays ?? 10;
    let stageEnteredDaysAgo: number;
    if (slaBucket < 0.65) {
      stageEnteredDaysAgo = randInt(1, Math.max(1, stageTimeline - 4));
    } else if (slaBucket < 0.85) {
      stageEnteredDaysAgo = stageTimeline - randInt(1, 3);
    } else {
      stageEnteredDaysAgo = stageTimeline + randInt(1, 20);
    }

    let assignedToId: string | undefined;
    const ownerRole = STAGES[currentStage]?.ownerRole;
    if (ownerRole === "REGIONAL_OFFICER") {
      const ro = pick(ros);
      assignedToId = ro?.id;
    } else if (ownerRole === "EVC_COMMITTEE") {
      assignedToId = pick(evcMembers);
    } else if (ownerRole === "BUREAU_OFFICER") {
      assignedToId = pick(bureauOfficers);
    } else if (ownerRole === "SAC_SHC_MEMBER") {
      assignedToId = sacMemberId;
    }

    const status = rand() < 0.05 ? "RETURNED" : "IN_PROGRESS";

    const app = await createApp({
      refNo: `APP-${String(i).padStart(5, "0")}`,
      institutionId: inst.id,
      regionId: inst.regionId,
      applicationType: appType,
      route: routeKey,
      currentStageKey: currentStage,
      status,
      submittedDaysAgo: stageEnteredDaysAgo + randInt(5, 30),
      stageEnteredDaysAgo,
      assignedToId,
    });
    applications.push(app.id);
  }

  // EVC Visits
  console.log("📡 Creating EVC visits...");
  // Get apps in EVC stages
  const evcQueuedApps = await prisma.application.findMany({
    where: { currentStageKey: "EVC_QUEUE" },
    take: 25,
  });
  for (const app of evcQueuedApps) {
    await prisma.evcVisit.upsert({
      where: { applicationId: app.id },
      create: {
        applicationId: app.id,
        status: "QUEUED",
        queuedAt: daysAgo(randInt(1, 5)),
        isNewInstitution: app.applicationType === "NEW_INSTITUTION",
      },
      update: {},
    });

    // EVC scheduling deadline
    await prisma.deadlineItem.create({
      data: {
        kind: "EVC_SCHEDULING",
        refType: "Application",
        refId: app.id,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: app.assignedToId ?? undefined,
        title: `${app.refNo} – EVC Scheduling deadline`,
        dueAt: daysFromNow(randInt(-2, 5)),
        state: "OPEN",
        applicationId: app.id,
      },
    });
  }

  const evcScheduledApps = await prisma.application.findMany({
    where: { currentStageKey: "EVC_SCHEDULED" },
    take: 20,
  });
  for (const app of evcScheduledApps) {
    const isNew = app.applicationType === "NEW_INSTITUTION";
    const scheduledFor = daysFromNow(randInt(-4, 15));
    await prisma.evcVisit.upsert({
      where: { applicationId: app.id },
      create: {
        applicationId: app.id,
        status: "SCHEDULED",
        queuedAt: daysAgo(randInt(5, 10)),
        scheduledFor,
        committeeId: app.refNo.startsWith("DEMO-") ? evcMembers[0] : pick(evcMembers),
        isNewInstitution: isNew,
      },
      update: {},
    });

    await prisma.deadlineItem.create({
      data: {
        kind: "EVC_COMPLETION",
        refType: "Application",
        refId: app.id,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: app.refNo.startsWith("DEMO-") ? evcMembers[0] : pick(evcMembers),
        title: `${app.refNo} – EVC Completion deadline`,
        dueAt: scheduledFor,
        state: "OPEN",
        escalationLevel: scheduledFor < DEMO_TODAY ? randInt(0, 2) : 0,
        applicationId: app.id,
      },
    });
  }

  const evcReportApps = await prisma.application.findMany({
    where: { currentStageKey: "EVC_REPORT" },
    take: 15,
  });
  for (const app of evcReportApps) {
    await prisma.evcVisit.upsert({
      where: { applicationId: app.id },
      create: {
        applicationId: app.id,
        status: "COMPLETED",
        queuedAt: daysAgo(randInt(30, 50)),
        scheduledFor: daysAgo(randInt(10, 25)),
        completedAt: daysAgo(randInt(1, 9)),
        reportRef: `EVC-RPT-${app.refNo}`,
        isNewInstitution: rand() < 0.3,
      },
      update: {},
    });
  }

  // Undertakings (~40)
  console.log("📝 Creating undertakings...");
  const decidedApps = await prisma.application.findMany({ where: { currentStageKey: "DECISION_PENDING" }, take: 20 });
  const demoAppsForUt = [demoApp1, demoApp2, demoApp3, demoApp4, demoApp5];
  const undertakingStatuses = ["PENDING", "SUBMITTED", "VERIFIED", "OVERDUE", "REJECTED"];
  for (let i = 0; i < 40; i++) {
    const app =
      i < 10
        ? demoAppsForUt[i % demoAppsForUt.length]
        : pick(decidedApps.length > 0 ? decidedApps : await prisma.application.findMany({ take: 20 }));
    const status = i === 0 ? "PENDING" : i === 1 ? "OVERDUE" : i === 2 ? "SUBMITTED" : pick(undertakingStatuses);
    const dueDate = status === "OVERDUE"
      ? daysAgo(randInt(1, 60))
      : daysFromNow(randInt(-5, 90));

    const ut = await prisma.undertaking.create({
      data: {
        applicationId: app.id,
        institutionId: app.institutionId,
        title: pick([
          "Submit fire safety certificate within 6 months",
          "Obtain NOC from state pollution board within 3 months",
          "Construct additional lab space within 1 year",
          "Appoint qualified faculty as per norms",
          "Submit revised affiliation certificate",
          "Complete infrastructure development as per schedule",
          "Maintain student-faculty ratio as prescribed",
          "Submit annual compliance report",
        ]),
        condition: "The institution undertakes to comply with all AICTE norms as stipulated.",
        dueDate,
        status,
        grantedAt: daysAgo(randInt(30, 120)),
        verifiedById: status === "VERIFIED" ? pick(allRegionalOfficers).id : null,
        verifiedAt: status === "VERIFIED" ? daysAgo(randInt(1, 10)) : null,
      },
    });

    if (status === "PENDING" || status === "OVERDUE") {
      const overdueLevel = status === "OVERDUE" ? randInt(1, 3) : 0;
      await prisma.deadlineItem.create({
        data: {
          kind: "UNDERTAKING",
          refType: "Undertaking",
          refId: ut.id,
          institutionId: app.institutionId,
          regionId: app.regionId,
          title: `Undertaking: ${ut.title.substring(0, 50)}`,
          dueAt: dueDate,
          state: "OPEN",
          escalationLevel: overdueLevel,
          applicationId: app.id,
          undertakingId: ut.id,
        },
      });
    }
  }

  // Documents (~50)
  console.log("📄 Creating documents...");
  const docTypes = ["LEASE", "NOC", "LAND_USE", "FIRE_SAFETY", "BUILDING_STABILITY", "OTHER"];
  const docStatuses = ["VALID", "EXPIRING", "EXPIRED", "RENEWAL_SUBMITTED"];
  for (let i = 0; i < 50; i++) {
    // Guarantee the first 10 institutions (which have login accounts) each get 2 documents (1 expiring/expired, 1 valid)
    const inst = i < 20 ? institutions[i % 10] : pick(institutions);
    const docType = i < 10 ? "LEASE" : i < 20 ? "FIRE_SAFETY" : pick(docTypes);
    const status = (() => {
      if (i < 5) return "EXPIRING";
      if (i < 10) return "EXPIRED";
      if (i < 20) return "VALID";
      const r = rand();
      if (r < 0.40) return "VALID";
      if (r < 0.55) return "EXPIRING";
      if (r < 0.65) return "EXPIRED";
      if (r < 0.73) return "RENEWAL_SUBMITTED";
      return "VALID";
    })();

    const validFrom = daysAgo(randInt(180, 1000));
    const validUntil = status === "VALID"
      ? daysFromNow(randInt(91, 365))
      : status === "EXPIRING"
      ? daysFromNow(randInt(1, 89))
      : status === "EXPIRED"
      ? daysAgo(randInt(1, 90))
      : daysFromNow(randInt(30, 180));

    const regionId = inst.regionId;
    const ro = pick(allRegionalOfficers.filter((r) => r.regionId === regionId));

    const doc = await prisma.instDocument.create({
      data: {
        institutionId: inst.id,
        docType,
        title: `${docType.replace("_", " ")} Certificate – ${inst.name}`,
        validFrom,
        validUntil,
        status,
        verifiedById: null,
        verifiedAt: null,
      },
    });

    if (["VALID", "EXPIRING", "EXPIRED", "RENEWAL_SUBMITTED"].includes(status)) {
      await prisma.deadlineItem.create({
        data: {
          kind: "DOCUMENT_EXPIRY",
          refType: "InstDocument",
          refId: doc.id,
          institutionId: inst.id,
          regionId,
          title: `${doc.title} – Expiry`,
          dueAt: validUntil,
          state: status === "EXPIRED" ? "OPEN" : "OPEN",
          escalationLevel: status === "EXPIRED" ? randInt(0, 2) : 0,
          documentId: doc.id,
        },
      });
    }
  }

  // Observations on demo app
  await prisma.observation.create({
    data: {
      applicationId: demoApp1.id,
      stageKey: "SCRUTINY",
      authorId: demoRegionROs[0]?.id ?? adminId,
      text: "Please submit the updated faculty list as per AICTE norms. Current list appears incomplete.",
      kind: "DEFICIENCY",
    },
  });

  // Notifications (~100 pre-seeded)
  console.log("🔔 Creating notifications...");
  const allUsers = await prisma.user.findMany();
  for (let i = 0; i < 100; i++) {
    const user = pick(allUsers);
    const isRead = rand() < 0.6;
    const kind = pick(["REMINDER", "OVERDUE", "ESCALATION", "INFO", "RETURN"]);
    await prisma.notification.create({
      data: {
        toUserId: user.id,
        channel: "INAPP",
        kind,
        subject: `${kind}: Attention required for your assigned items`,
        body: `Please review the pending ${kind.toLowerCase()} items assigned to you. Action required by deadline.`,
        createdAt: daysAgo(randInt(0, 30)),
        readAt: isRead ? daysAgo(randInt(0, 15)) : null,
      },
    });
  }

  // Some escalation events for overdue items
  console.log("⚠️ Creating escalation events...");
  const overdueDeadlines = await prisma.deadlineItem.findMany({
    where: { escalationLevel: { gt: 0 }, state: "OPEN" },
    take: 20,
  });
  for (const dl of overdueDeadlines) {
    const ro = pick(allRegionalOfficers);
    await prisma.escalationEvent.create({
      data: {
        deadlineItemId: dl.id,
        fromLevel: 0,
        toLevel: dl.escalationLevel,
        escalatedToUserId: dl.escalationLevel >= 3 ? bureauOfficers[0] : ro.id,
        reason: `Overdue by more than ${dl.escalationLevel * 5} days`,
        createdAt: daysAgo(randInt(1, 10)),
      },
    });
  }

  // Alert logs for fired alerts on overdue items
  for (const dl of overdueDeadlines) {
    await prisma.alertLog.createMany({
      data: [
        { deadlineItemId: dl.id, alertKey: "T-1", firedAt: daysAgo(2) },
        { deadlineItemId: dl.id, alertKey: "T0", firedAt: daysAgo(1) },
        { deadlineItemId: dl.id, alertKey: "OVERDUE+0", firedAt: daysAgo(0) },
      ],
    });
  }

  // Final audit entry
  await appendAudit(prisma, {
    actorId: adminId,
    actorRole: "ADMIN",
    action: "TICK_RUN",
    entityType: "System",
    entityId: "engine",
    payload: { remindersFired: 0, overdueMarked: 0, escalations: 0, tickedAt: DEMO_TODAY, note: "seed" },
  });

  console.log("✅ Seed complete!");
  console.log("\n📋 Demo logins:");
  console.log("  admin@demo.aicte                  → ADMIN");
  console.log("  bo.alpha@demo.aicte               → BUREAU_OFFICER");
  console.log("  ro.central.alpha@demo.aicte       → REGIONAL_OFFICER (Central)");
  console.log("  ro.southern.alpha@demo.aicte      → REGIONAL_OFFICER (Southern)");
  console.log("  evc.member1@demo.aicte            → EVC_COMMITTEE");
  console.log("  sac.member@demo.aicte             → SAC_SHC_MEMBER");
  console.log("  inst.sgsits@demo.aicte            → INSTITUTION (SGSITS Indore)");
  console.log("  inst.jec@demo.aicte               → INSTITUTION (JEC Jabalpur)");
  console.log("  inst.dtu@demo.aicte               → INSTITUTION (DTU Delhi)");
  console.log("  inst.coep@demo.aicte              → INSTITUTION (COEP Pune)");
  console.log("\n🎯 Demo applications: DEMO-NEW-INST-001, DEMO-NEW-COURSE-002, DEMO-EXTENSION-003, DEMO-INTAKE-004, DEMO-EVC-SAC-005");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
