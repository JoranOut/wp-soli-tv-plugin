import { createContext, useState, useEffect, useMemo } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

export const TvMessageContext = createContext({
    messages: [],
    saveTVMessage: (message) => {},
});

export default function TvMessageProvider({ children }) {
    const [messages, setMessages] = useState([]);

    const yesterday = ( d => new Date(d.setDate(d.getDate()-1)) )(new Date);
    const nextMonth = ( d => new Date(d.setDate(d.getDate()+31)) )(new Date);

    const saveTVMessage = (message) => {
        // This function can be used to save messages, e.g., to a server or local storage
        message.startDate = yesterday;
        message.endDate = nextMonth;
        message.status = 'draft';

        apiFetch({
            path: 'soli_tv/v1/message/' + (message.id ? message.id : ''),
            method: 'POST',
            data: toTVMessageDto(message)
        }).then(
            (response) => {
                let newMessage = fromTVMessageDto(response)
                if(messages.some(m => m.id === newMessage.id)){
                    setMessages(messages.map(m => m.id === newMessage.id ? newMessage : m))
                } else {
                    setMessages([...messages, fromTVMessageDto(newMessage)])
                }
            },
            (error) => {
                console.error(error)
            }
        );
    };

    const getTVMessages = () => {
        apiFetch({path: 'soli_tv/v1/messages'})
            .then(
                (tvMessages) => {
                    if(tvMessages){
                        setMessages(tvMessages.map(m => fromTVMessageDto(m)));
                    }
                },
                (error) => {
                    console.error(error)
                }
            );
    };

    const tomorrow = ( d => new Date(d.setDate(d.getDate()+1)) )(new Date);

    useEffect(() => {
        getTVMessages();
        // setMessages([
        //     { id: 1, title: 'Welcome to TV Settings', content: 'This is your first message.', img: 7, startDate: yesterday, endDate: tomorrow},
        //     { id: 2, title: 'Bericht 2', content: null, img: null, startDate: yesterday, endDate: tomorrow },
        // ])
    }, []);

    return (
        <TvMessageContext.Provider value={{ messages, saveTVMessage }}>
            {children}
        </TvMessageContext.Provider>
    );
}

function toTVMessageDto(message){
    return {
        id: message.id,
        title: message.title,
        type: message.type,
        content: message.content,
        start_date: message.startDate,
        end_date: message.endDate,
        img: message.img,
        status: message.status,
        link: message.link,
    }
}

function fromTVMessageDto(message){
    return {
        id: message.id,
        title: message.title,
        type: message.type,
        content: message.content,
        startDate: message.start_date ? new Date(message.start_date) : null,
        endDate: message.end_date ? new Date(message.end_date) : null,
        img: message.img,
        status: message.status,
        link: message.link,
    }

}


