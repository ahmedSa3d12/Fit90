import{c as n,u as i,j as e,af as d,ag as u,ah as x,ai as h}from"./index-C5TGklnJ.js";/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=n("MapPin",[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]]);function g({open:c,onOpenChange:t,lat:r,lng:s,employeeName:o}){const{ui:a}=i(),l=r!=null&&s!=null&&r!==""&&s!==""?`https://maps.google.com/maps?q=${r},${s}&hl=ar&z=14&output=embed`:null;return e.jsx(d,{open:c,onOpenChange:t,children:e.jsxs(u,{className:"max-w-2xl",children:[e.jsx(x,{children:e.jsx(h,{children:a(o?`موقع ${o}`:"الموقع الجغرافي")})}),l?e.jsx("iframe",{title:a("خريطة الموقع"),src:l,className:"h-[360px] w-full rounded-lg border border-border",loading:"lazy",referrerPolicy:"no-referrer-when-downgrade"}):e.jsx("p",{className:"py-12 text-center text-sm text-muted-foreground",children:a("لا تتوفر إحداثيات GPS لهذا السجل.")})]})})}export{f as M,g as a};
