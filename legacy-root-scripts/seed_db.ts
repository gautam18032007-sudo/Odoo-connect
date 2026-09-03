import fs from "fs";
import { sql } from "../src/lib/db";

async function seed() {
	const data = JSON.parse(fs.readFileSync("legacy_data.json", "utf8"));
	console.log(`Loaded ${data.length} records. Seeding database...`);

	try {
		// We'll insert these into the public.orders table.
		for (const order of data) {
			if (!order.refNo) continue;

			// Parse dates (they might be in DD-MMM-YY format)
			let deliveryDate = null;
			if (order.deliveryDate && order.deliveryDate !== "-") {
				deliveryDate = new Date(order.deliveryDate);
				if (isNaN(deliveryDate.getTime())) deliveryDate = null;
			}

			let orderDate = null;
			if (order.orderDate && order.orderDate !== "-") {
				orderDate = new Date(order.orderDate);
				if (isNaN(orderDate.getTime())) orderDate = null;
			}

			let targetPfhDate = null;
			if (order.targetPfhDate && order.targetPfhDate !== "-") {
				targetPfhDate = new Date(order.targetPfhDate);
				if (isNaN(targetPfhDate.getTime())) targetPfhDate = null;
			}

			const res = await sql`
        INSERT INTO public.orders (
          ref_no, buyer, brand, style_id, style_name, order_qty, delivery_date, target_pfh_date
        ) VALUES (
          ${order.refNo}, 
          ${order.buyer}, 
          ${order.brand}, 
          ${order.styleNo}, 
          ${order.styleName}, 
          ${order.orderQty}, 
          ${deliveryDate}, 
          ${targetPfhDate}
        )
        ON CONFLICT (ref_no) DO UPDATE SET
          buyer = EXCLUDED.buyer,
          brand = EXCLUDED.brand,
          style_id = EXCLUDED.style_id,
          style_name = EXCLUDED.style_name,
          order_qty = EXCLUDED.order_qty,
          delivery_date = EXCLUDED.delivery_date,
          target_pfh_date = EXCLUDED.target_pfh_date
        RETURNING id
      `;

			if (res.length > 0) {
				const orderId = res[0].id;

				// Ensure tracking rows exist
				await sql`
          INSERT INTO public.fabric_tracking (order_id, status_red, status_orange, status_green)
          VALUES (${orderId}, 0, 0, 0)
          ON CONFLICT (order_id) DO NOTHING
        `;

				await sql`
          INSERT INTO public.trims_tracking (order_id, status_red, status_orange, status_green)
          VALUES (${orderId}, 0, 0, 0)
          ON CONFLICT (order_id) DO NOTHING
        `;
			}
		}

		console.log("Seeding complete!");
	} catch (error) {
		console.error("Error seeding:", error);
	}
}

seed();
