import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export async function POST(req: Request) {
    try {
        const { orderId } = await req.json();

        if (!orderId) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        // Fetch store settings to get Stripe secret key
        const settingsRef = doc(db, 'settings', 'store');
        const settingsSnap = await getDoc(settingsRef);

        if (!settingsSnap.exists()) {
            return NextResponse.json({ error: 'Store settings not found' }, { status: 500 });
        }

        const settingsData = settingsSnap.data();

        if (!settingsData.enableStripe || !settingsData.stripeSecretKey) {
            return NextResponse.json({ error: 'Stripe is not configured or enabled on this store' }, { status: 400 });
        }

        // Initialize Stripe
        const stripe = new Stripe(settingsData.stripeSecretKey);

        // Fetch Order
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        }

        const orderData = orderSnap.data();

        // Build line items for Stripe Checkout
        const lineItems = orderData.items.map((item: any) => {
            // Stripe requires price in the smallest currency unit (e.g., satang for THB, cents for USD)
            // Assuming the store currency is THB for this example, or we could make it configurable. 
            // Often it's THB. Let's use THB.
            return {
                price_data: {
                    currency: 'thb',
                    product_data: {
                        name: item.productName + (item.variantInfo ? ` (${item.variantInfo})` : ''),
                        images: item.imageUrl ? [item.imageUrl] : [],
                    },
                    unit_amount: Math.round(item.finalPrice * 100), // THB to Satang
                },
                quantity: item.quantity,
            };
        });

        // Add Delivery Fee if applicable
        if (orderData.deliveryFee > 0) {
            lineItems.push({
                price_data: {
                    currency: 'thb',
                    product_data: {
                        name: 'ค่าจัดส่ง (Delivery Fee)',
                    },
                    unit_amount: Math.round(orderData.deliveryFee * 100),
                },
                quantity: 1,
            });
        }

        // Calculate and apply order-level discounts (if totalDiscount > 0)
        // Stripe doesn't support negative line items directly in checkout without a coupon, 
        // so if there's an order-level discount, we pass it as a `discounts` object if configured in Stripe, 
        // or we adjust the line items. Easiest way for checkout session when dealing with custom amounts 
        // is to either use a stripe coupon, OR adjust the line items proportionally, or just pass a coupon.
        // Wait, the orderData already has `finalPrice` for items which MIGHT include the discount?
        // Let's check page.tsx... `finalPrice` on items is calculated. BUT `totalDiscount` is also saved.
        // Looking at page.tsx: `finalPrice` = item.price - bestAuto.discountValue. So item-level discount is in `finalPrice`.
        // Coupon discount is subtracted from `netTotal`, items are NOT discounted per unit for coupon. 
        // Actually, coupon discount is `totalDiscount`, items have original price in `finalPrice`.
        // To handle order-level discounts cleanly in Stripe without creating a Coupon object dynamically:
        // We can create a "Discount" line item with negative price? No, stripe forbids negative unit_amount.
        // We will need to create a Stripe Coupon on the fly and apply it to the session.

        let sessionParams: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ['card', 'promptpay'], // PromptPay can be enabled if supported by the Stripe account in Thailand
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin')}/checkout/summary?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || req.headers.get('origin')}/checkout/payment`,
            client_reference_id: orderId,
            metadata: {
                orderId: orderId,
            }
        };

        if (orderData.totalDiscount > 0) {
            // Create an ephemeral coupon for the exact discount amount
            const coupon = await stripe.coupons.create({
                amount_off: Math.round(orderData.totalDiscount * 100),
                currency: 'thb',
                duration: 'once',
                name: 'Discount',
            });
            sessionParams.discounts = [{ coupon: coupon.id }];
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });

    } catch (error: any) {
        console.error('Error creating Stripe Checkout Session:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
