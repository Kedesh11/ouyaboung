// Component wrapper to add structured data to specific pages
import React from 'react';

interface StructuredDataProps {
  data: object | object[];
  children?: React.ReactNode;
}

export function StructuredData({ data, children }: StructuredDataProps) {
  const schemas = Array.isArray(data) ? data : [data];

  return (
    <>
      {children}
      {schemas.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema),
          }}
        />
      ))}
    </>
  );
}
