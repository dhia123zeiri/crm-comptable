import {IsNumber} from 'class-validator'
export class createSessionRequest {
    @IsNumber()
    factureId: number;
    

}