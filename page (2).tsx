const admin = require("firebase-admin");
const dotenv = require("dotenv");
const path = require("path");

// Load .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") });

// Check credentials
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("❌ Error: Missing FIREBASE_PROJECT_ID or FIREBASE_PRIVATE_KEY in .env.local");
    process.exit(1);
}

// Initialize Firebase Admin
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
    }
} catch (error) {
    console.error("❌ Firebase Init Error:", error.message);
    process.exit(1);
}

const db = admin.firestore();

const products = [
    {
        name: "Nike Blazer Mid '77 Vintage",
        description: "Styled for the '70s. Loved in the '80s. Classic in the '90s. Ready for the future. The Nike Blazer Mid '77 delivers a timeless design that's easy to wear.",
        price: 3600,
        stock: 50,
        category: "Nike",
        imageUrl: "https://static.nike.com/a/images/t_PDP_1728_v1/f_auto,q_auto:eco/fb7eda3c-5ac8-4d05-a18f-1c2c5e82e36e/blazer-mid-77-vintage-mens-shoes-nw30B2.png",
        isActive: true
    },
    {
        name: "Nike Air Force 1 '07",
        description: "The radiance lives on in the Nike Air Force 1 '07, the b-ball icon that puts a fresh spin on what you know best: crisp leather, bold colors and the perfect amount of flash to make you shine.",
        price: 3500,
        stock: 30,
        category: "Nike",
        imageUrl: "https://static.nike.com/a/images/c_limit,w_592,f_auto/t_product_v1/e6da41fa-1be4-4ce5-b89c-22be4f1f02d4/air-force-1-07-mens-shoes-jBrhbr.png",
        isActive: true
    },
    {
        name: "Adidas Superstar",
        description: "Built for basketball, adopted by hip hop and skate, the classic leather Superstar changed the game the moment it stepped off the court.",
        price: 3200,
        stock: 45,
        category: "Adidas",
        imageUrl: "https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/7ed0855435194229a525aad6009a0497_9366/Superstar_Shoes_White_EG4958_01_standard.jpg",
        isActive: true
    },
    {
        name: "Puma Suede Classic XXI",
        description: "The Suede hit the scene in 1968 and has been changing the game ever since. It's been worn by the icons of every generation.",
        price: 2800,
        stock: 20,
        category: "Puma",
        imageUrl: "https://images.puma.com/image/upload/f_auto,q_auto,b_rgb:fafafa,w_2000,h_2000/global/374915/01/sv01/fnd/THA/fmt/png/Suede-Classic-XXI-Sneakers",
        isActive: true
    },
    {
        name: "New Balance 530",
        description: "The 530 men's sneaker is a throwback of one of our classic running shoes. This casual kick combines everyday style with modern tech.",
        price: 3900,
        stock: 15,
        category: "New Balance",
        imageUrl: "https://nb.scene7.com/is/image/NB/mr530sg_nb_02_i?$pdpflexf2$",
        isActive: true
    }
];

async function seedProducts() {
    console.log("🚀 Starting to seed products...");
    const batch = db.batch();

    for (const product of products) {
        const docRef = db.collection("products").doc(); // Auto ID
        batch.set(docRef, {
            ...product,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    try {
        await batch.commit();
        console.log(`✅ Successfully added ${products.length} products!`);
    } catch (error) {
        console.error("❌ Error seeding products:", error);
    }
}

seedProducts();
