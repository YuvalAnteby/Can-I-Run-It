/**
 * Responsible on persistence of the user's setup
 */
import {createContext, useContext, useEffect, useState} from "react";

const SetupContext = createContext();

export function SetupProvider({children}) {
    const [setup, setSetup] = useState(() => {
        // local caching of the setup
        try {
            return JSON.parse(localStorage.getItem("userSetup") || {cpu: null, gpu: null, ram: null});
        } catch {
            return {cpu: null, gpu: null, ram: null};
        }
    });

    // Save whenever the setup updates
    useEffect(() => {
        localStorage.setItem("userSetup", JSON.stringify(setup));
    }, [setup]);

    return (
        <SetupContext.Provider value={{setup, setSetup}}>
            {children}
        </SetupContext.Provider>
    );
}

export const useSetup = () => useContext(SetupContext);