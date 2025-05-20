import { createContext, useState } from "react";

const UserContext = createContext();

export function UserProvider({ children }) {
    const [userHardware, setUserHardware] = useState({
        cpu: "",
        gpu: "",
        ram: ""
    });

    return (
        <UserContext.Provider value={{ userHardware, setUserHardware }}>
            {children}
        </UserContext.Provider>
    );
}

export default UserContext;
