import Navbar from "@/components/Navbar";
import { ouyaboungOrganizationSchema, ouyaboungWebSiteSchema } from "@/lib/seo/schemas";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen">
            <Navbar />
            {children}
            
            {/* Structured Data for SEO */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(ouyaboungOrganizationSchema),
                }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(ouyaboungWebSiteSchema),
                }}
            />
        </div>
    );
}
