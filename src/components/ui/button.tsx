import React from "react";
export function Button({children,className="",variant="",...props}) {
  let base="px-3 py-2 rounded text-sm font-medium transition";
  let styles={
    "": "bg-black text-white hover:bg-gray-800",
    secondary:"bg-gray-200 text-black hover:bg-gray-300",
    destructive:"bg-red-600 text-white hover:bg-red-700"
  };
  return <button className={base+" "+(styles[variant]||styles[""])+" "+className} {...props}>{children}</button>;
}