import React from "react";
export function Card({children,className="",...props}) {
  return <div className={"border rounded p-4 bg-white "+className} {...props}>{children}</div>;
}