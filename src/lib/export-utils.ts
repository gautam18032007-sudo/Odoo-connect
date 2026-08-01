import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export function exportToCSV(data: any[], filename: string) {
	if (data.length === 0) return;

	const headers = Object.keys(data[0]);
	const csvContent = [
		headers.join(","),
		...data.map((row) =>
			headers
				.map((header) => {
					const value = row[header] ?? "";
					const stringValue =
						typeof value === "string" ? value : JSON.stringify(value);
					// Escape quotes and wrap in quotes if contains comma
					return `"${stringValue.replace(/"/g, '""')}"`;
				})
				.join(","),
		),
	].join("\n");

	const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.setAttribute("href", url);
	link.setAttribute("download", `${filename}.csv`);
	link.style.visibility = "hidden";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
}

export function exportToXLSX(data: any[], filename: string) {
	if (data.length === 0) return;

	const worksheet = XLSX.utils.json_to_sheet(data);
	const workbook = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
	XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportToPDF(data: any[], filename: string) {
	if (data.length === 0) return;

	const doc = new jsPDF();
	const headers = Object.keys(data[0]);
	const body = data.map((item) => headers.map((header) => item[header]));

	// Add title to PDF
	doc.setFontSize(18);
	doc.text(filename.replace(/-/g, " ").toUpperCase(), 14, 15);
	doc.setFontSize(10);
	doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 22);

	autoTable(doc, {
		head: [headers.map((h) => h.toUpperCase())],
		body: body,
		startY: 30,
		theme: "striped",
		headStyles: {
			fillColor: [255, 255, 255],
			textColor: [0, 0, 0],
			fontStyle: "bold",
		},
		styles: { fontSize: 8 },
	});

	doc.save(`${filename}.pdf`);
}
