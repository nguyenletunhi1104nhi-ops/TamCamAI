import { useEffect, useState } from "react";

function CurrentTimeLine() {
  const getCurrentTop = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    return hours * 60 + minutes;
  };

  const [top, setTop] = useState(getCurrentTop());

  useEffect(() => {
    const interval = setInterval(() => {
      setTop(getCurrentTop());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="absolute left-0 right-0 z-20 flex items-center"
      style={{ top: `${top}px` }}
    >
      <div className="w-3 h-3 rounded-full bg-pink-500 -ml-[6px]" />
      <div className="h-[2px] flex-1 bg-pink-500" />
    </div>
  );
}

export default CurrentTimeLine;