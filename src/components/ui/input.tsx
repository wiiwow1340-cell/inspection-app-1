import React from "react";
export function Input(props) {
  return <input {...props} className={"border p-2 rounded w-full "+(props.className||"")} />;
}