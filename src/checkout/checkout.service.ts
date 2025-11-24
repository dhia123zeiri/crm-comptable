import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusFacture } from '@prisma/client';
import { FacturesService } from 'src/factures/factures.service';
import Stripe from 'stripe';

@Injectable()
export class CheckoutService {
    constructor(
        private readonly stripe: Stripe,
        private readonly factureService: FacturesService,
        private readonly configService: ConfigService
    ) {}

    async createSession(factureId: number) {
        const facture = await this.factureService.getFacture(factureId);
        
        return this.stripe.checkout.sessions.create({
            metadata:{
                factureId: factureId.toString(), // Convertir en string pour Stripe
            },
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        unit_amount: facture.totalTTC * 100,
                        product_data: { 
                            name: facture.numero,
                            description: facture.status,
                        }
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: this.configService.getOrThrow('STRIPE_SUCCESS_URL'),
            cancel_url: this.configService.getOrThrow('STRIPE_CANCEL_URL'),
        });
    }

    async handleCheckoutWebhook(event: any) {
        if (event.type !== 'checkout.session.completed') {
            return;
        }

        const session = await this.stripe.checkout.sessions.retrieve(
            event.data.object.id,
        );

        // Vérifier que metadata existe et contient factureId
        if (!session.metadata || !session.metadata.factureId) {
            throw new Error('Metadata factureId manquant dans la session de checkout');
        }

        await this.factureService.update(
            parseInt(session.metadata.factureId), 
            {
                status: StatusFacture.PAYEE,
                datePaiement: new Date()
            }
        );
    }
}